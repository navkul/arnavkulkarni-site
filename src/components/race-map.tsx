'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { RunningActivity } from '@/lib/strava';

type PaceRange = NonNullable<RunningActivity['course']>['paceRange'];

const paceColors = ['#eff6ff', '#bfdbfe', '#60a5fa', '#1d7ff2', '#005fc4', '#003b82', '#001940'];

const smoothSpeeds = (speeds: Array<number | null>, radius = 8) =>
  speeds.map((speed, index) => {
    if (speed === null) {
      return null;
    }

    const window = speeds
      .slice(Math.max(0, index - radius), Math.min(speeds.length, index + radius + 1))
      .filter((value): value is number => value !== null);

    if (window.length === 0) {
      return speed;
    }

    return window.reduce((total, value) => total + value, 0) / window.length;
  });

const getQuantile = (values: number[], quantile: number) => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * quantile)));
  return sorted[index];
};

const getPaceDomain = (speeds: number[], paceRange: PaceRange) => {
  if (paceRange) {
    return {
      min: paceRange.slowestSpeedMetersPerSecond,
      max: paceRange.fastestSpeedMetersPerSecond,
    };
  }

  return {
    min: getQuantile(speeds, 0.12),
    max: getQuantile(speeds, 0.9),
  };
};

const getPaceColor = (speed: number | null, speeds: number[], paceRange: PaceRange) => {
  if (speed === null || speeds.length === 0) {
    return '#60a5fa';
  }

  const { min, max } = getPaceDomain(speeds, paceRange);
  const range = max - min || 1;
  const normalized = Math.min(1, Math.max(0, (speed - min) / range));
  const boosted = Math.pow(normalized, 0.58);
  const colorIndex = Math.min(paceColors.length - 1, Math.max(0, Math.floor(boosted * paceColors.length)));
  return paceColors[colorIndex];
};

function RaceMap({ activity }: { activity: RunningActivity }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const speeds = useMemo(
    () =>
      activity.course?.points
        .filter((point) => point.moving)
        .map((point) => point.speedMetersPerSecond)
        .filter((speed): speed is number => speed !== null) ?? [],
    [activity.course?.points],
  );

  useEffect(() => {
    if (!containerRef.current || !activity.course?.points.length) {
      return;
    }

    let isCancelled = false;
    let cleanup = () => {};

    const initMap = async () => {
      const L = await import('leaflet');

      if (isCancelled || !containerRef.current || !activity.course?.points.length) {
        return;
      }

      const map = L.map(containerRef.current, {
        attributionControl: false,
        scrollWheelZoom: false,
        zoomControl: false,
      });

      L.control
        .zoom({
          position: 'topleft',
        })
        .addTo(map);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        subdomains: 'abcd',
        opacity: 1,
      }).addTo(map);

      const positions = activity.course.points.map((point) => point.position);
      const baseRoute = L.polyline(positions, {
        color: '#0b1220',
        opacity: 0.9,
        weight: 9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
      const smoothedSpeeds = smoothSpeeds(
        activity.course.points.map((point) => (point.moving ? point.speedMetersPerSecond : null)),
        8,
      );
      const colorSpeeds = smoothedSpeeds.filter((speed): speed is number => speed !== null);

      for (let index = 1; index < activity.course.points.length; index += 1) {
        const previous = activity.course.points[index - 1];
        const current = activity.course.points[index];

        L.polyline([previous.position, current.position], {
          color: getPaceColor(
            smoothedSpeeds[index] ?? smoothedSpeeds[index - 1],
            colorSpeeds,
            activity.course.paceRange,
          ),
          opacity: 0.98,
          weight: 6,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
        }).addTo(map);
      }

      const start = activity.course.points[0].position;
      const finish = activity.course.points[activity.course.points.length - 1].position;

      L.circleMarker(start, {
        radius: 5,
        color: '#dbeafe',
        fillColor: '#0066cc',
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip('Start')
        .addTo(map);

      L.circleMarker(finish, {
        radius: 5,
        color: '#0066cc',
        fillColor: '#dbeafe',
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip('Finish')
        .addTo(map);

      const legend = new L.Control({ position: 'bottomright' });
      legend.onAdd = () => {
        const element = L.DomUtil.create('div', 'race-map-legend');
        element.innerHTML = `
          <div class="race-map-legend-title">Pace</div>
          <div class="race-map-legend-scale">
            ${paceColors.map((color) => `<span style="background:${color}"></span>`).join('')}
          </div>
          <div class="race-map-legend-labels">
            <span>${activity.course?.paceRange?.slowest ?? 'slower'}</span>
            <span>${activity.course?.paceRange?.fastest ?? 'faster'}</span>
          </div>
        `;
        return element;
      };
      legend.addTo(map);

      map.fitBounds(baseRoute.getBounds(), {
        padding: [24, 24],
      });

      cleanup = () => {
        map.remove();
      };
    };

    initMap();

    return () => {
      isCancelled = true;
      cleanup();
    };
  }, [activity, speeds]);

  if (!activity.course) {
    return (
      <div className="flex min-h-80 items-center justify-center border border-gray-200 px-6 text-center text-sm text-gray-500">
        Route map will show here when the race includes map data.
      </div>
    );
  }

  return (
    <div className="aspect-square w-full max-w-[25.5rem] overflow-hidden border border-blue-200 bg-slate-950 md:justify-self-end">
      <div ref={containerRef} className="h-full w-full" aria-label={`Pace map for ${activity.name}`} />
    </div>
  );
}

export default RaceMap;
