import { useState } from 'react';
import { describeMilestone } from './milestone';

export default function App() {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <main className="shell">
      <header className="topbar"><span className="brand-mark">T</span><span className="brand">Talus</span><span className="status">Milestone 0</span></header>
      <section className="hero">
        <div className="eyebrow">TEST AUTHORING · VERSION GENERATION</div>
        <h1>Better tests.<br /><em>More versions.</em></h1>
        <p className="lede">Talus is a browser-based workspace for building assessments, generating equivalent versions, and preparing answer keys.</p>
        <div className="actions"><button type="button" onClick={() => setShowDetails((value) => !value)} aria-expanded={showDetails}>{showDetails ? 'Hide roadmap' : 'View the roadmap'}</button><span className="hint">Your cloud build pipeline is ready for its first run.</span></div>
        {showDetails && <section className="roadmap" aria-label="Development roadmap"><h2>Coming in Milestone 1</h2><p>{describeMilestone(1)}</p><ul><li>Rich-text question authoring</li><li>Independent section shuffling and question variants</li><li>Reproducible versions and answer keys</li><li>Local autosave and Markdown export</li></ul></section>}
      </section>
      <footer>Talus · Client-side by design · No account required</footer>
    </main>
  );
}
