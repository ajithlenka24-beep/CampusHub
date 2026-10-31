import { ChatWindow } from "../components/ChatWindow";
import { PageHead } from "../components/ui";

export default function AssistantPage() {
  return (
    <div className="assistant-page">
      <PageHead title="CampusHub AI Assistant" subtitle="Ask about matching internships, skills to learn, your profile, applications or your team. Answers use only your own CampusHub data." />
      <ChatWindow />
    </div>
  );
}
