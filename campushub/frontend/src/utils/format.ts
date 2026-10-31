import type { ApplicationStatus, OpportunityType, WorkMode } from "../types";

export const formatDate = (value: string | Date | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "—";

export const formatDateTime = (value: string | Date) =>
  new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function timeAgo(value: string | Date) {
  const seconds = (Date.now() - new Date(value).getTime()) / 1000;
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(value);
}

export const TYPE_LABELS: Record<OpportunityType, string> = {
  INTERNSHIP: "Internship",
  HACKATHON: "Hackathon",
  WORKSHOP: "Workshop",
  COMPETITION: "Competition",
  RESEARCH: "Research",
  CAMPUS_EVENT: "Campus Event",
  PROJECT: "Project",
};

export const WORK_MODE_LABELS: Record<WorkMode, string> = { ONSITE: "On-site", REMOTE: "Remote", HYBRID: "Hybrid" };

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  APPLIED: "Applied",
  SHORTLISTED: "Shortlisted",
  INTERVIEW: "Interview",
  SELECTED: "Selected",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export const CATEGORY_LABELS: Record<string, string> = {
  PROGRAMMING: "Programming",
  WEB: "Web",
  DATABASE: "Database",
  CORE_CS: "Core CS",
  AI_ML: "AI/ML",
  DESIGN: "Design",
  TESTING: "Testing",
  DEVOPS: "DevOps",
  SOFT_SKILL: "Soft skill",
  OTHER: "Other",
};

export const matchColor = (score: number) => (score >= 75 ? "var(--mint)" : score >= 50 ? "var(--gold)" : "var(--warning)");

export function deadlineText(daysLeft: number, isOpen: boolean) {
  if (!isOpen || daysLeft < 0) return "Closed";
  if (daysLeft === 0) return "Closes today";
  return `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
}

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "CH";

export const toDateInput = (value: string | null | undefined) => (value ? value.slice(0, 10) : "");
