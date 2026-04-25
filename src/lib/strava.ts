import 'server-only';

import https from 'https';
import { cache } from 'react';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const METERS_PER_MILE = 1609.344;
const METERS_PER_FOOT = 0.3048;
const MIN_USEFUL_RUNNING_SPEED = METERS_PER_MILE / (13 * 60);
const MAX_USEFUL_RUNNING_SPEED = METERS_PER_MILE / (4 * 60);
const WEEK_REVALIDATE_SECONDS = 60 * 60 * 24 * 7;
const MANUAL_RACE_ACTIVITY_IDS = [18158203606, 16676946767];
const RACE_NOTE_SLUG_BY_ACTIVITY_ID: Record<number, string> = {
  18158203606: 'newport-half',
  16676946767: 'gloucester-half',
};

type StravaSummaryMap = {
  polyline?: string | null;
  summary_polyline?: string | null;
};

type StravaSplit = {
  distance: number;
  elapsed_time: number;
  elevation_difference: number;
  moving_time: number;
  split: number;
  average_speed: number;
};

type StravaStream<T> = {
  data: T[];
};

type StravaStreamSet = {
  latlng?: StravaStream<[number, number]>;
  distance?: StravaStream<number>;
  altitude?: StravaStream<number>;
  velocity_smooth?: StravaStream<number>;
  moving?: StravaStream<boolean>;
};

type StravaActivity = {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  sport_type?: string;
  type?: string;
  start_date: string;
  start_date_local: string;
  map?: StravaSummaryMap;
  description?: string | null;
  workout_type?: number | null;
  average_speed?: number | null;
  max_speed?: number | null;
  calories?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  average_cadence?: number | null;
  elev_high?: number | null;
  elev_low?: number | null;
  weighted_average_watts?: number | null;
  splits_standard?: StravaSplit[] | null;
};

type StravaError = {
  message?: string;
  errors?: Array<{
    resource?: string;
    field?: string;
    code?: string;
  }>;
};

export type RunningActivity = {
  id: number;
  name: string;
  distanceMiles: number;
  movingMinutes: number;
  elapsedMinutes: number;
  elevationFeet: number;
  pacePerMile: string | null;
  startDate: string;
  sportType: string;
  routePath: string | null;
  route: {
    path: string;
    start: { x: number; y: number };
    finish: { x: number; y: number };
    mileMarkers: Array<{ mile: number; x: number; y: number }>;
  } | null;
  course: {
    coordinates: Array<[number, number]>;
    points: Array<{
      position: [number, number];
      speedMetersPerSecond: number | null;
      elevationFeet: number | null;
      moving: boolean;
    }>;
    mileMarkers: Array<{ mile: number; position: [number, number] }>;
    elevationProfile: Array<{ distanceMiles: number; elevationFeet: number }>;
    paceRange: {
      slowest: string;
      fastest: string;
      slowestSpeedMetersPerSecond: number;
      fastestSpeedMetersPerSecond: number;
    } | null;
  } | null;
  description: string | null;
  raceNoteSlug: string | null;
  averageSpeedMph: number | null;
  maxSpeedMph: number | null;
  calories: number | null;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  averageCadence: number | null;
  elevationHighFeet: number | null;
  elevationLowFeet: number | null;
  weightedPower: number | null;
  fastestSplit: {
    mile: number;
    pacePerMile: string;
  } | null;
  splits: Array<{
    mile: number;
    pacePerMile: string;
    movingTime: string;
    elevationFeet: number;
  }>;
};

export type RunningOverview = {
  source: 'strava' | 'not-configured' | 'unavailable';
  fetchedAt: string | null;
  races: RunningActivity[];
  latestRuns: RunningActivity[];
  weeklyStats: {
    runCount: number;
    distanceMiles: number;
    movingHours: number;
    elevationFeet: number;
  };
  message: string | null;
};

const round = (value: number, digits = 1) => Number(value.toFixed(digits));

const metersPerSecondToMilesPerHour = (value: number | null | undefined) =>
  typeof value === 'number' && value > 0 ? round(value * 2.236936, 1) : null;

const metersToFeet = (value: number | null | undefined) =>
  typeof value === 'number' ? Math.round(value / METERS_PER_FOOT) : null;

const downsample = <T,>(items: T[], maxItems: number) => {
  if (items.length <= maxItems) {
    return items;
  }

  const step = (items.length - 1) / (maxItems - 1);
  return Array.from({ length: maxItems }, (_, index) => items[Math.round(index * step)]);
};

const formatPace = (movingSeconds: number, distanceMeters: number) => {
  if (!movingSeconds || !distanceMeters) {
    return null;
  }

  const secondsPerMile = movingSeconds / (distanceMeters / METERS_PER_MILE);
  const minutes = Math.floor(secondsPerMile / 60);
  const seconds = Math.round(secondsPerMile % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const getQuantile = (values: number[], quantile: number) => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * quantile)));
  return sorted[index];
};

const decodePolyline = (encoded: string) => {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: Array<[number, number]> = [];

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lat / 1e5, lng / 1e5]);
  }

  return coordinates;
};

const toProjectedPoint = (
  [lat, lng]: [number, number],
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
) => {
  const latRange = bounds.maxLat - bounds.minLat || 1;
  const lngRange = bounds.maxLng - bounds.minLng || 1;
  const padding = 8;
  const usable = 100 - padding * 2;

  return {
    x: round(padding + ((lng - bounds.minLng) / lngRange) * usable, 2),
    y: round(padding + (1 - (lat - bounds.minLat) / latRange) * usable, 2),
  };
};

const getDistanceMeters = ([startLat, startLng]: [number, number], [endLat, endLng]: [number, number]) => {
  const radiusMeters = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(endLat - startLat);
  const dLng = toRadians(endLng - startLng);
  const lat1 = toRadians(startLat);
  const lat2 = toRadians(endLat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return radiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const interpolateCoordinate = (
  start: [number, number],
  end: [number, number],
  ratio: number,
): [number, number] => [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];

const getCoordinateAtDistance = (coordinates: Array<[number, number]>, targetMeters: number) => {
  let coveredMeters = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const segmentMeters = getDistanceMeters(start, end);

    if (coveredMeters + segmentMeters >= targetMeters) {
      const ratio = segmentMeters === 0 ? 0 : (targetMeters - coveredMeters) / segmentMeters;
      return interpolateCoordinate(start, end, ratio);
    }

    coveredMeters += segmentMeters;
  }

  return coordinates.at(-1) ?? coordinates[0];
};

const buildRoute = (polyline: string | null | undefined, distanceMeters: number) => {
  if (!polyline) {
    return null;
  }

  try {
    const coordinates = decodePolyline(polyline);
    if (coordinates.length < 2) {
      return null;
    }

    const lats = coordinates.map(([lat]) => lat);
    const lngs = coordinates.map(([, lng]) => lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const bounds = { minLat, maxLat, minLng, maxLng };
    const projectedPoints = coordinates.map((coordinate) => toProjectedPoint(coordinate, bounds));
    const path = projectedPoints
      .map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`)
      .join(' ');
    const distanceMiles = distanceMeters / METERS_PER_MILE;
    const markerMiles = [1, 5, 10, Math.floor(distanceMiles)].filter(
      (mile, index, miles) => mile > 0 && mile < distanceMiles && miles.indexOf(mile) === index,
    );

    return {
      path,
      start: projectedPoints[0],
      finish: projectedPoints[projectedPoints.length - 1],
      mileMarkers: markerMiles.map((mile) => ({
        mile,
        ...toProjectedPoint(getCoordinateAtDistance(coordinates, mile * METERS_PER_MILE), bounds),
      })),
    };
  } catch {
    return null;
  }
};

const buildRoutePath = (polyline: string | null | undefined) => buildRoute(polyline, 0)?.path ?? null;

const buildMileMarkers = (
  coordinates: Array<[number, number]>,
  distanceMeters: number,
  distanceStream: number[] | undefined,
) => {
  const distanceMiles = distanceMeters / METERS_PER_MILE;
  const markerMiles = Array.from({ length: Math.floor(distanceMiles) }, (_, index) => index + 1);

  return markerMiles.map((mile) => {
    const targetMeters = mile * METERS_PER_MILE;
    if (distanceStream?.length === coordinates.length) {
      let nearestIndex = 0;
      let nearestDelta = Number.POSITIVE_INFINITY;

      distanceStream.forEach((distance, index) => {
        const delta = Math.abs(distance - targetMeters);
        if (delta < nearestDelta) {
          nearestDelta = delta;
          nearestIndex = index;
        }
      });

      return {
        mile,
        position: coordinates[nearestIndex],
      };
    }

    return {
      mile,
      position: getCoordinateAtDistance(coordinates, targetMeters),
    };
  });
};

const buildElevationProfile = (distanceStream: number[] | undefined, altitudeStream: number[] | undefined) => {
  if (!distanceStream?.length || !altitudeStream?.length) {
    return [];
  }

  const pointCount = Math.min(distanceStream.length, altitudeStream.length);
  const points = Array.from({ length: pointCount }, (_, index) => ({
    distanceMiles: round(distanceStream[index] / METERS_PER_MILE, 2),
    elevationFeet: Math.round(altitudeStream[index] / METERS_PER_FOOT),
  }));

  return downsample(points, 90);
};

const buildCoursePoints = (
  coordinates: Array<[number, number]>,
  velocityStream: number[] | undefined,
  altitudeStream: number[] | undefined,
  movingStream: boolean[] | undefined,
) => {
  const points = coordinates.map((position, index) => ({
    position,
    speedMetersPerSecond:
      velocityStream && typeof velocityStream[index] === 'number' && velocityStream[index] > 0
        ? velocityStream[index]
        : null,
    elevationFeet:
      altitudeStream && typeof altitudeStream[index] === 'number'
        ? Math.round(altitudeStream[index] / METERS_PER_FOOT)
        : null,
    moving: movingStream ? movingStream[index] === true : true,
  }));

  return downsample(points, 500);
};

const buildPaceRange = (velocityStream: number[] | undefined, movingStream: boolean[] | undefined) => {
  const movingSpeeds = velocityStream?.filter((speed, index) => speed > 0 && (movingStream ? movingStream[index] : true));
  const speeds = movingSpeeds?.filter(
    (speed) => speed >= MIN_USEFUL_RUNNING_SPEED && speed <= MAX_USEFUL_RUNNING_SPEED,
  );

  if (!speeds?.length) {
    if (!movingSpeeds?.length) {
      return null;
    }

    const slowestFallbackSpeed = getQuantile(movingSpeeds, 0.1);
    const fastestFallbackSpeed = getQuantile(movingSpeeds, 0.9);

    return {
      slowest: formatPace(METERS_PER_MILE / slowestFallbackSpeed, METERS_PER_MILE) ?? '—',
      fastest: formatPace(METERS_PER_MILE / fastestFallbackSpeed, METERS_PER_MILE) ?? '—',
      slowestSpeedMetersPerSecond: round(slowestFallbackSpeed, 2),
      fastestSpeedMetersPerSecond: round(fastestFallbackSpeed, 2),
    };
  }

  const slowestSpeed = getQuantile(speeds, 0.12);
  const fastestSpeed = getQuantile(speeds, 0.9);

  return {
    slowest: formatPace(METERS_PER_MILE / slowestSpeed, METERS_PER_MILE) ?? '—',
    fastest: formatPace(METERS_PER_MILE / fastestSpeed, METERS_PER_MILE) ?? '—',
    slowestSpeedMetersPerSecond: round(slowestSpeed, 2),
    fastestSpeedMetersPerSecond: round(fastestSpeed, 2),
  };
};

const buildCourse = (activity: StravaActivity, streams: StravaStreamSet | null | undefined) => {
  const coordinates =
    streams?.latlng?.data ??
    (activity.map?.polyline ? decodePolyline(activity.map.polyline) : decodePolyline(activity.map?.summary_polyline ?? ''));

  if (coordinates.length < 2) {
    return null;
  }

  return {
    coordinates: downsample(coordinates, 450),
    points: buildCoursePoints(
      coordinates,
      streams?.velocity_smooth?.data,
      streams?.altitude?.data,
      streams?.moving?.data,
    ),
    mileMarkers: buildMileMarkers(coordinates, activity.distance, streams?.distance?.data),
    elevationProfile: buildElevationProfile(streams?.distance?.data, streams?.altitude?.data),
    paceRange: buildPaceRange(streams?.velocity_smooth?.data, streams?.moving?.data),
  };
};

const getFastestSplit = (splits: StravaSplit[] | null | undefined) => {
  if (!splits?.length) {
    return null;
  }

  const fastest = splits
    .filter((split) => split.moving_time > 0 && split.distance > 0)
    .sort((a, b) => a.moving_time / a.distance - b.moving_time / b.distance)[0];

  if (!fastest) {
    return null;
  }

  return {
    mile: fastest.split,
    pacePerMile: formatPace(fastest.moving_time, fastest.distance) ?? '—',
  };
};

const isRun = (activity: StravaActivity) => {
  const sport = activity.sport_type ?? activity.type ?? '';
  return ['Run', 'TrailRun', 'VirtualRun'].includes(sport);
};

const normalizeDescription = (description: string | null | undefined) => {
  const normalized = description?.replace(/\s+/g, ' ').trim();
  return normalized ? normalized : null;
};

const isRaceRun = (activity: RunningActivity) => {
  const name = activity.name.toLowerCase();
  const raceNamePattern =
    /\b(race|marathon|half|5k|10k|15k|20k|turkey trot|classic|invitational|championship|road race)\b/;
  const raceDistances = [3.1, 6.2, 9.3, 13.1, 26.2];
  const isNearRaceDistance = raceDistances.some(
    (distance) => Math.abs(activity.distanceMiles - distance) <= 0.2,
  );
  const hasSpecificName = !/^(morning|afternoon|evening|lunch|night) run$/i.test(activity.name);

  return raceNamePattern.test(name) || (hasSpecificName && isNearRaceDistance);
};

const buildSplits = (splits: StravaSplit[] | null | undefined) =>
  splits?.map((split) => ({
    mile: split.split,
    pacePerMile: formatPace(split.moving_time, split.distance) ?? '—',
    movingTime: formatMovingDuration(split.moving_time),
    elevationFeet: Math.round(split.elevation_difference / METERS_PER_FOOT),
  })) ?? [];

const formatMovingDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const toRunningActivity = (activity: StravaActivity, streams?: StravaStreamSet | null): RunningActivity => ({
  id: activity.id,
  name: activity.name,
  distanceMiles: round(activity.distance / METERS_PER_MILE),
  movingMinutes: Math.round(activity.moving_time / 60),
  elapsedMinutes: Math.round(activity.elapsed_time / 60),
  elevationFeet: Math.round(activity.total_elevation_gain / METERS_PER_FOOT),
  pacePerMile: formatPace(activity.moving_time, activity.distance),
  startDate: activity.start_date_local || activity.start_date,
  sportType: activity.sport_type ?? activity.type ?? 'Run',
  routePath: buildRoutePath(activity.map?.summary_polyline),
  route: buildRoute(activity.map?.summary_polyline, activity.distance),
  course: buildCourse(activity, streams),
  description: normalizeDescription(activity.description),
  raceNoteSlug: RACE_NOTE_SLUG_BY_ACTIVITY_ID[activity.id] ?? null,
  averageSpeedMph: metersPerSecondToMilesPerHour(activity.average_speed),
  maxSpeedMph: metersPerSecondToMilesPerHour(activity.max_speed),
  calories: typeof activity.calories === 'number' ? Math.round(activity.calories) : null,
  averageHeartrate:
    typeof activity.average_heartrate === 'number' ? Math.round(activity.average_heartrate) : null,
  maxHeartrate: typeof activity.max_heartrate === 'number' ? Math.round(activity.max_heartrate) : null,
  averageCadence: typeof activity.average_cadence === 'number' ? round(activity.average_cadence, 1) : null,
  elevationHighFeet: metersToFeet(activity.elev_high),
  elevationLowFeet: metersToFeet(activity.elev_low),
  weightedPower:
    typeof activity.weighted_average_watts === 'number' ? Math.round(activity.weighted_average_watts) : null,
  fastestSplit: getFastestSplit(activity.splits_standard),
  splits: buildSplits(activity.splits_standard),
});

const fetchActivities = async (token: string) =>
  fetch(`${STRAVA_API_BASE}/athlete/activities?per_page=50`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    next: { revalidate: WEEK_REVALIDATE_SECONDS },
  });

const fetchActivityDetail = async (token: string, activityId: number) =>
  fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    next: { revalidate: WEEK_REVALIDATE_SECONDS },
  });

const fetchActivityStreams = async (token: string, activityId: number) =>
  fetch(
    `${STRAVA_API_BASE}/activities/${activityId}/streams?keys=latlng,distance,altitude,velocity_smooth,moving&key_by_type=true`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      next: { revalidate: WEEK_REVALIDATE_SECONDS },
    },
  );

const getOverviewWithToken = async (token: string) => {
  const response = await fetchActivities(token);

  if (!response.ok) {
    return {
      response,
      overview: null,
    };
  }

  const fetchDetailedRun = async (activity: StravaActivity) => {
    try {
      const detailResponse = await fetchActivityDetail(token, activity.id);
      if (!detailResponse.ok) {
        return activity;
      }

      return {
        ...activity,
        ...((await detailResponse.json()) as StravaActivity),
      };
    } catch {
      return activity;
    }
  };

  const summaryRuns = ((await response.json()) as StravaActivity[]).filter(isRun);
  const detailedRuns = await Promise.all(summaryRuns.slice(0, 12).map(fetchDetailedRun));
  const manualRaceRuns = await Promise.all(
    MANUAL_RACE_ACTIVITY_IDS.map(async (activityId) => {
      try {
        const detailResponse = await fetchActivityDetail(token, activityId);
        if (!detailResponse.ok) {
          return null;
        }

        return (await detailResponse.json()) as StravaActivity;
      } catch {
        return null;
      }
    }),
  );
  const manualRaceStreams = new Map<number, StravaStreamSet>();
  await Promise.all(
    MANUAL_RACE_ACTIVITY_IDS.map(async (activityId) => {
      try {
        const streamResponse = await fetchActivityStreams(token, activityId);
        if (!streamResponse.ok) {
          return;
        }

        manualRaceStreams.set(activityId, (await streamResponse.json()) as StravaStreamSet);
      } catch {
        // The detailed polyline still gives us a usable map if streams are unavailable.
      }
    }),
  );

  const activityMap = new Map<number, RunningActivity>();
  [...detailedRuns, ...manualRaceRuns]
    .filter((activity): activity is StravaActivity => activity !== null)
    .filter(isRun)
    .map((activity) => toRunningActivity(activity, manualRaceStreams.get(activity.id)))
    .forEach((activity) => {
      activityMap.set(activity.id, activity);
    });

  const activities = [...activityMap.values()].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
  );
  const curatedRaceIds = new Set(MANUAL_RACE_ACTIVITY_IDS);
  const races = activities
    .filter((activity) => curatedRaceIds.has(activity.id) || isRaceRun(activity))
    .slice(0, 5)
    .map((race) => ({
      ...race,
      description: null,
    }));
  const raceIds = new Set(races.map((race) => race.id));
  const latestRuns = activities.filter((activity) => !raceIds.has(activity.id)).slice(0, 4);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weeklyRuns = activities.filter(
    (activity) => new Date(activity.startDate).getTime() >= sevenDaysAgo,
  );

  return {
    response,
    overview: {
      source: 'strava' as const,
      fetchedAt: new Date().toISOString(),
      races,
      latestRuns,
      weeklyStats: {
        runCount: weeklyRuns.length,
        distanceMiles: round(
          weeklyRuns.reduce((total, activity) => total + activity.distanceMiles, 0),
        ),
        movingHours: round(
          weeklyRuns.reduce((total, activity) => total + activity.movingMinutes, 0) / 60,
        ),
        elevationFeet: weeklyRuns.reduce((total, activity) => total + activity.elevationFeet, 0),
      },
      message: activities.length === 0 ? 'No recent runs came back from Strava yet.' : null,
    },
  };
};

const getOverviewWithRefresh = async () => {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const refreshToken = process.env.STRAVA_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  return new Promise<RunningOverview | null>((resolve) => {
    const request = https.request(
      STRAVA_TOKEN_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body.toString()),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        response.on('end', () => {
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            resolve(null);
            return;
          }

          try {
            const token = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
              access_token?: string;
            };

            if (!token.access_token) {
              resolve(null);
              return;
            }

            getOverviewWithToken(token.access_token)
              .then((result) => resolve(result.overview))
              .catch(() => resolve(null));
          } catch {
            resolve(null);
          }
        });
      },
    );

    request.on('error', () => {
      resolve(null);
    });

    request.write(body.toString());
    request.end();
  });
};

const emptyOverview = (
  source: RunningOverview['source'],
  message: string | null,
): RunningOverview => ({
  source,
  fetchedAt: null,
  races: [],
  latestRuns: [],
  weeklyStats: {
    runCount: 0,
    distanceMiles: 0,
    movingHours: 0,
    elevationFeet: 0,
  },
  message,
});

const getStravaFailureMessage = async (response: Response) => {
  try {
    const body = (await response.json()) as StravaError;
    const missingActivityRead = body.errors?.some(
      (error) => error.field === 'activity:read_permission' && error.code === 'missing',
    );

    if (missingActivityRead) {
      return 'Authorize the Strava app with activity:read before recent runs can sync.';
    }
  } catch {
    // The status code is still useful even when Strava does not return JSON.
  }

  if (response.status === 401) {
    return 'Strava authorization failed for this build.';
  }

  return 'Strava did not return recent runs for this build.';
};

export const getRunningOverview = cache(async (): Promise<RunningOverview> => {
  try {
    const configuredAccessToken = process.env.STRAVA_ACCESS_TOKEN;

    if (configuredAccessToken) {
      const { response, overview } = await getOverviewWithToken(configuredAccessToken);

      if (overview) {
        return overview;
      }

      if (response.status !== 401) {
        return emptyOverview('unavailable', await getStravaFailureMessage(response));
      }
    }

    return (
      (await getOverviewWithRefresh()) ??
      emptyOverview('not-configured', 'Add Strava credentials to show recent runs.')
    );
  } catch {
    return emptyOverview('unavailable', 'Strava is unavailable right now.');
  }
});
