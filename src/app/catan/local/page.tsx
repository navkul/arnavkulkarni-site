import Link from 'next/link';
import '../catan.css';
export default function LocalHostingPage() {
  return (
    <main className="ct-app ct-local-guide">
      <header className="ct-header">
        <Link href="/catan">← Catan</Link>
      </header>
      <h1>Offline play</h1>
      <p>
        One computer hosts. Everyone joins on the same Wi-Fi or hotspot. No internet is needed
        during play, and local games don’t affect stats.
      </p>
      <ol>
        <li>
          While online, install Node.js 22 and download{' '}
          <a href="https://github.com/navkul/arnavkulkarni-site">the site source</a>. In its folder,
          prepare the local app once:
          <code>
            npm ci
            <br />
            npm run catan:prepare-local
          </code>
        </li>
        <li>
          Start the host, even without internet:<code>npm run catan:local</code>
        </li>
        <li>
          <a href="http://localhost:3212/catan?hosting=local">Open the local app →</a> Start a table
          and share the Wi-Fi address shown there. Other players open that address, then enter the
          table code or choose “Find local tables.”
        </li>
      </ol>
      <p className="ct-muted">
        Keep the host running. Allow local network access if your firewall asks. Guest Wi-Fi that
        isolates devices won’t work.
      </p>
    </main>
  );
}
