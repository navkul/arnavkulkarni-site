const publishedCV =
  'https://raw.githubusercontent.com/navkul/arnavkulkarni-site/published-cv/cv.pdf';

export async function GET() {
  const pdf = await fetch(publishedCV, { cache: 'no-store' });
  if (!pdf.ok) {
    return new Response('The CV is temporarily unavailable.', { status: 502 });
  }

  return new Response(pdf.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="Arnav-Kulkarni-CV.pdf"',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
