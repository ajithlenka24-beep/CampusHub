/**
 * Pure skill-name logic shared by matching, the team engine and the skill catalogue.
 * No database access here, so it is easy to unit-test and explain.
 */
import type { SkillCategory } from "../db/schema.js";

/** Different spellings of the same skill map to ONE canonical (lowercase) name. */
export const SKILL_ALIASES: Record<string, string> = {
  cpp: "c++",
  "c plus plus": "c++",
  js: "javascript",
  ecmascript: "javascript",
  ts: "typescript",
  py: "python",
  python3: "python",
  ml: "machine learning",
  ai: "artificial intelligence",
  dl: "deep learning",
  oops: "oop",
  "object oriented programming": "oop",
  "object-oriented programming": "oop",
  "data structures": "dsa",
  "data structures and algorithms": "dsa",
  "data structures & algorithms": "dsa",
  reactjs: "react",
  "react.js": "react",
  nodejs: "node.js",
  node: "node.js",
  expressjs: "express",
  "express.js": "express",
  vuejs: "vue",
  "vue.js": "vue",
  nextjs: "next.js",
  postgres: "postgresql",
  mongo: "mongodb",
  "ui/ux design": "ui/ux",
  k8s: "kubernetes",
  cicd: "ci/cd",
  "ci cd": "ci/cd",
  golang: "go",
  sklearn: "scikit-learn",
};

/** Nice display names for common canonical skills. */
const DISPLAY_NAMES: Record<string, string> = {
  "c++": "C++",
  "c#": "C#",
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  java: "Java",
  "machine learning": "Machine Learning",
  "artificial intelligence": "AI",
  "deep learning": "Deep Learning",
  oop: "OOP",
  dsa: "DSA",
  react: "React",
  "node.js": "Node.js",
  express: "Express",
  sql: "SQL",
  mysql: "MySQL",
  postgresql: "PostgreSQL",
  mongodb: "MongoDB",
  html: "HTML",
  css: "CSS",
  git: "Git",
  github: "GitHub",
  docker: "Docker",
  "ci/cd": "CI/CD",
  "ui/ux": "UI/UX",
  figma: "Figma",
  aws: "AWS",
  linux: "Linux",
  "rest api": "REST API",
  tensorflow: "TensorFlow",
  pytorch: "PyTorch",
  kubernetes: "Kubernetes",
  "scikit-learn": "scikit-learn",
};

/** Lowercase, collapse spaces and resolve aliases: "  JS " → "javascript". */
export function normalizeSkill(name: string): string {
  const key = String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return SKILL_ALIASES[key] ?? key;
}

export function displaySkillName(input: string): string {
  const normalized = normalizeSkill(input);
  return DISPLAY_NAMES[normalized] ?? input.trim().replace(/\s+/g, " ");
}

/* ----------------------------------------------------------- team skill areas */
export interface TeamArea {
  area: string;
  role: string;
  critical: boolean;
  examples: string;
  keywords: string[];
}

/** The 7 skill areas a project team needs (used by Group Up and the career tracker). */
export const TEAM_AREAS: TeamArea[] = [
  {
    area: "Frontend",
    role: "Frontend Developer",
    critical: true,
    examples: "HTML, CSS, React",
    keywords: ["html", "html5", "css", "css3", "javascript", "typescript", "react", "vue", "angular", "next.js", "svelte", "tailwind", "tailwind css", "bootstrap", "sass", "jquery", "redux", "frontend", "front-end", "web development"],
  },
  {
    area: "Backend",
    role: "Backend Developer",
    critical: true,
    examples: "Node.js, Java, C++",
    keywords: ["c", "c++", "java", "python", "node.js", "express", "django", "flask", "fastapi", "spring", "spring boot", "php", "laravel", "go", "rust", "c#", ".net", "asp.net", "ruby", "ruby on rails", "kotlin", "rest api", "api", "apis", "graphql", "microservices", "backend", "back-end", "dsa", "oop", "system design"],
  },
  {
    area: "Database",
    role: "Database Engineer",
    critical: true,
    examples: "SQL, PostgreSQL, MongoDB",
    keywords: ["sql", "mysql", "postgresql", "mongodb", "sqlite", "oracle", "firebase", "supabase", "redis", "dbms", "nosql", "database", "databases", "sql server", "pl/sql", "prisma", "drizzle"],
  },
  {
    area: "AI/ML",
    role: "AI/ML Engineer",
    critical: false,
    examples: "Machine Learning, TensorFlow",
    keywords: ["machine learning", "artificial intelligence", "ai/ml", "deep learning", "tensorflow", "pytorch", "keras", "scikit-learn", "nlp", "computer vision", "opencv", "data science", "data analysis", "pandas", "numpy", "llm", "generative ai", "neural networks"],
  },
  {
    area: "UI/UX",
    role: "UI/UX Designer",
    critical: false,
    examples: "Figma, Wireframing",
    keywords: ["figma", "ui", "ux", "ui/ux", "ui design", "ux design", "ux research", "user research", "wireframing", "prototyping", "adobe xd", "sketch", "canva", "photoshop", "illustrator", "graphic design", "web design", "interaction design"],
  },
  {
    area: "Testing",
    role: "Testing Engineer",
    critical: false,
    examples: "Selenium, Jest, Manual Testing",
    keywords: ["testing", "qa", "quality assurance", "selenium", "cypress", "playwright", "jest", "mocha", "junit", "pytest", "postman", "unit testing", "manual testing", "automation testing", "test automation", "tester", "vitest"],
  },
  {
    area: "DevOps",
    role: "DevOps Engineer",
    critical: false,
    examples: "Git, Docker, CI/CD",
    keywords: ["git", "github", "gitlab", "github actions", "ci/cd", "docker", "kubernetes", "jenkins", "aws", "azure", "gcp", "google cloud", "linux", "bash", "shell scripting", "terraform", "ansible", "nginx", "devops", "cloud", "cloud computing", "deployment"],
  },
];

export const AREA_NAMES = TEAM_AREAS.map((a) => a.area);

/** On a tie, prefer the more specialised role (general languages are common to everyone). */
const ROLE_PRIORITY = ["AI/ML", "UI/UX", "Testing", "DevOps", "Database", "Frontend", "Backend"];

const AREA_KEYWORDS = new Map(TEAM_AREAS.map(({ area, keywords }) => [area, new Set(keywords.map(normalizeSkill))]));

/** Which areas does a skill belong to? Matches the whole name or any single word in it. */
export function detectSkillAreas(skill: string): string[] {
  const raw = String(skill ?? "").trim().toLowerCase();
  if (!raw) return [];
  const candidates = [normalizeSkill(raw), ...raw.split(/[\s/,]+/).filter(Boolean).map(normalizeSkill)];
  return TEAM_AREAS.filter(({ area }) => candidates.some((c) => AREA_KEYWORDS.get(area)!.has(c))).map((a) => a.area);
}

/** Recommended role = the area that most of a person's skills belong to. */
export function recommendRoleArea(skillNames: string[]): string | null {
  const counts = new Map<string, number>();
  for (const skill of skillNames) {
    for (const area of detectSkillAreas(skill)) counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  if (!counts.size) return null;
  const best = Math.max(...counts.values());
  return ROLE_PRIORITY.find((area) => counts.get(area) === best) ?? null;
}

export const roleLabel = (area: string | null | undefined) => TEAM_AREAS.find((a) => a.area === area)?.role ?? "Generalist";

/* ----------------------------------------------------------- categories */
const CORE_CS = new Set(
  ["dsa", "oop", "algorithms", "operating systems", "computer networks", "discrete mathematics", "compiler design", "theory of computation", "computer architecture"].map(normalizeSkill),
);
const SOFT = new Set(["communication", "leadership", "teamwork", "problem solving", "public speaking", "time management"]);
const LANGUAGES = new Set(["c", "c++", "java", "python", "go", "rust", "c#", "kotlin", "ruby", "php", "swift"].map(normalizeSkill));

const AREA_TO_CATEGORY: Record<string, SkillCategory> = {
  Frontend: "WEB",
  Backend: "PROGRAMMING",
  Database: "DATABASE",
  "AI/ML": "AI_ML",
  "UI/UX": "DESIGN",
  Testing: "TESTING",
  DevOps: "DEVOPS",
};

export function guessCategory(name: string): SkillCategory {
  const key = normalizeSkill(name);
  if (!key) return "OTHER";
  if (CORE_CS.has(key)) return "CORE_CS";
  if (SOFT.has(key)) return "SOFT_SKILL";
  if (LANGUAGES.has(key)) return "PROGRAMMING";
  const area = detectSkillAreas(name)[0];
  return area ? AREA_TO_CATEGORY[area] : "OTHER";
}

/** Human label for a 0–100 proficiency value. */
export function proficiencyLevel(value: number): "Beginner" | "Intermediate" | "Advanced" | "Expert" {
  if (value >= 85) return "Expert";
  if (value >= 65) return "Advanced";
  if (value >= 40) return "Intermediate";
  return "Beginner";
}
