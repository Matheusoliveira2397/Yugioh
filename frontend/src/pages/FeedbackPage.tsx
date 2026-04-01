import ModerationFeedbackPanel from '../components/ModerationFeedbackPanel';

export default function FeedbackPage() {
  return (
    <div className="min-h-screen p-4 md:p-8 relative z-10">
      <div className="max-w-2xl mx-auto">
        <ModerationFeedbackPanel showPageHeader />
      </div>
    </div>
  );
}
