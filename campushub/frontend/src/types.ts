export type Role = "STUDENT" | "ADMIN";
export type ApplicationStatus = "APPLIED" | "SHORTLISTED" | "INTERVIEW" | "SELECTED" | "REJECTED" | "WITHDRAWN";
export type OpportunityType = "INTERNSHIP" | "HACKATHON" | "WORKSHOP" | "COMPETITION" | "RESEARCH" | "CAMPUS_EVENT" | "PROJECT";
export type WorkMode = "ONSITE" | "REMOTE" | "HYBRID";

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  onboardingCompleted: boolean;
  emailVerified: boolean;
  avatarUrl: string | null;
}

export interface SkillRef { id: number; name: string }

export interface StudentSkill {
  id: number;
  skillId: number;
  name: string;
  category: string;
  proficiency: number;
  experienceMonths: number;
  level: string;
}

export interface CompletionSection { key: string; label: string; points: number; done: boolean; tip: string }
export interface Completion { percentage: number; earned: number; total: number; sections: CompletionSection[] }

export interface Match {
  percentage: number;
  matched: SkillRef[];
  missing: SkillRef[];
  requiredCount: number;
  formula: string;
}

export interface Opportunity {
  id: string;
  title: string;
  organization: string;
  description: string;
  type: OpportunityType;
  eligibility: string;
  location: string;
  workMode: WorkMode;
  deadline: string;
  applicationUrl: string | null;
  createdAt: string;
  isOpen: boolean;
  daysLeft: number;
  requiredSkills: SkillRef[];
  match: Match;
  application: { id: string; status: ApplicationStatus } | null;
}

export interface HistoryEntry { id: number; fromStatus: ApplicationStatus | null; toStatus: ApplicationStatus; note: string; createdAt: string; changedBy?: string | null }

export interface Application {
  id: string;
  status: ApplicationStatus;
  coverNote: string;
  matchScoreAtApply: number;
  createdAt: string;
  updatedAt: string;
  opportunity: { id: string; title: string; organization: string; type: OpportunityType; deadline: string; location: string; workMode: WorkMode };
  history: HistoryEntry[];
}

export interface Project { id: string; title: string; description: string; technologies: string[]; githubUrl: string | null; liveUrl: string | null; imageUrl: string | null }
export interface Achievement { id: string; title: string; description: string; achievedOn: string | null }
export interface Certification { id: string; name: string; issuer: string; issueDate: string | null; credentialUrl: string | null }

export interface Profile {
  account: { id: string; email: string; fullName: string; emailVerified: boolean; createdAt: string };
  profile: { college: string; course: string; department: string; semester: number | null; bio: string; avatarUrl: string | null; githubUrl: string | null; linkedinUrl: string | null; portfolioUrl: string | null };
  skills: StudentSkill[];
  projects: Project[];
  achievements: Achievement[];
  certifications: Certification[];
  completion: Completion;
}

export interface Notification { id: string; type: string; title: string; message: string; link: string | null; read: boolean; createdAt: string }

export interface TeamMember { userId: string; fullName: string; avatarUrl: string | null; course: string; skills: { name: string; proficiency: number; level: string }[]; roleArea: string; roleLabel: string; recommendedRole: string | null; isAutoRole: boolean; isOwner: boolean; joinedAt: string }
export interface TeamAnalysis {
  coverage: number;
  readiness: number;
  readinessLabel: string;
  readinessParts: { label: string; weight: number; score: number }[];
  areaCoverage: { area: string; role: string; covered: boolean; skills: string[]; owners: string[] }[];
  requiredSkillCoverage: { percentage: number; matched: string[]; missing: string[] } | null;
  missingRoles: { area: string; role: string; critical: boolean; examples: string }[];
  summary: string;
  recommendations: string[];
}
export interface Team { id: string; name: string; projectTitle: string; description: string; maxSize: number; ownerId: string; createdAt: string; requiredSkills: SkillRef[]; members: TeamMember[]; analysis: TeamAnalysis }

export interface ScorePart { key: string; label: string; score: number; weight: number; formula: string }
export interface AiStatus { mode: "ai" | "fallback"; provider: string; model: string; label: string }
