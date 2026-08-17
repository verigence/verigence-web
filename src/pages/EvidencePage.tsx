import EvidenceUploadPanel from '../components/EvidenceUploadPanel';

export default function EvidencePage() {
  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Evidence</span>
          <h1>Capture source evidence</h1>
          <p>
            Upload documents from the browser or capture a photo on a native Capacitor build. Facts
            should be extracted downstream instead of manually re-entered here.
          </p>
        </div>
      </div>
      <EvidenceUploadPanel />
    </section>
  );
}
