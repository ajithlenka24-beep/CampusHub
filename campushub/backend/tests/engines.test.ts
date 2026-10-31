import { describe, expect, it } from "vitest";
import { analyseTeam, calculateMatch, calculateProfileCompletion, candidateFit } from "../src/services/engines.js";
import { detectSkillAreas, guessCategory, normalizeSkill, recommendRoleArea } from "../src/services/skillNormalizer.js";

const refs = (...names: string[]) => names.map((name, id) => ({ id, name }));

describe("skill matching engine", () => {
  it("matches the README example: 3 of 4 required skills = 75%", () => {
    const result = calculateMatch(refs("C++", "Python", "DSA", "OOP", "SQL"), refs("C++", "DSA", "OOP", "Git"));
    expect(result.percentage).toBe(75);
    expect(result.matched.map((s) => s.name)).toEqual(["C++", "DSA", "OOP"]);
    expect(result.missing.map((s) => s.name)).toEqual(["Git"]);
  });

  it("normalises case, spacing and aliases", () => {
    expect(normalizeSkill("  c++ ")).toBe("c++");
    expect(normalizeSkill("JS")).toBe("javascript");
    expect(normalizeSkill("Data Structures")).toBe("dsa");
    expect(calculateMatch(refs("js", "ML"), refs("JavaScript", "Machine Learning")).percentage).toBe(100);
  });

  it("is deterministic and never exceeds 0–100", () => {
    const a = calculateMatch(refs("C++"), refs("C++", "Git", "SQL"));
    const b = calculateMatch(refs("C++"), refs("C++", "Git", "SQL"));
    expect(a).toEqual(b);
    expect(a.percentage).toBe(33);
    expect(calculateMatch([], refs("Git")).percentage).toBe(0);
  });
});

describe("profile completion", () => {
  const base = { fullName: "A", college: "C", course: "CSE", semester: 3, bio: "", avatarUrl: null, skillCount: 0, projectCount: 0, achievementCount: 0, certificationCount: 0, githubUrl: null, linkedinUrl: null };
  it("adds fixed points per section (total 100)", () => {
    expect(calculateProfileCompletion(base).percentage).toBe(15);
    const full = calculateProfileCompletion({ ...base, bio: "x".repeat(40), avatarUrl: "/a.png", skillCount: 3, projectCount: 1, achievementCount: 1, certificationCount: 1, githubUrl: "g", linkedinUrl: "l" });
    expect(full.percentage).toBe(100);
    expect(full.total).toBe(100);
  });
});

describe("team engine", () => {
  const phoenix = [
    { userId: "1", name: "Ajith", skills: ["C++", "Python", "JavaScript", "SQL", "DSA", "OOP", "HTML"], roleArea: "" },
    { userId: "2", name: "Rahul", skills: ["React", "JavaScript", "HTML", "CSS"], roleArea: "" },
    { userId: "3", name: "Arjun", skills: ["Python", "Machine Learning", "TensorFlow"], roleArea: "" },
    { userId: "4", name: "Sneha", skills: ["Figma", "UI Design", "Prototyping"], roleArea: "" },
    { userId: "5", name: "Kiran", skills: ["SQL", "MySQL", "MongoDB"], roleArea: "" },
  ];

  it("detects roles from skills (spec examples)", () => {
    expect(recommendRoleArea(["C++", "DSA"])).toBe("Backend");
    expect(recommendRoleArea(["Python", "ML"])).toBe("AI/ML");
    expect(recommendRoleArea(["HTML", "CSS", "JavaScript"])).toBe("Frontend");
    expect(recommendRoleArea(["Figma"])).toBe("UI/UX");
    expect(recommendRoleArea(["SQL"])).toBe("Database");
    expect(recommendRoleArea(["Git", "CI/CD"])).toBe("DevOps");
    expect(recommendRoleArea(["Manual Testing"])).toBe("Testing");
  });

  it("computes coverage 5/7 = 71% and readiness 89% for the demo team", () => {
    const analysis = analyseTeam({ members: phoenix });
    expect(analysis.coverage).toBe(71);
    expect(analysis.readiness).toBe(89);
    expect(analysis.missingRoles.map((r) => r.area)).toEqual(["Testing", "DevOps"]);
    expect(analysis.summary).toContain("missing dedicated Testing and DevOps roles");
  });

  it("uses required-skill coverage when the team lists required skills", () => {
    const analysis = analyseTeam({ members: phoenix, requiredSkills: ["React", "Git", "SQL", "Docker"] });
    expect(analysis.requiredSkillCoverage).toEqual({ percentage: 50, matched: ["React", "SQL"], missing: ["Git", "Docker"] });
  });

  it("is never Hackathon Ready while a critical role is missing", () => {
    const analysis = analyseTeam({ members: phoenix.slice(1) /* no backend owner */ });
    expect(analysis.readinessLabel).not.toBe("Hackathon Ready");
  });

  it("ranks candidates by the gaps they fill", () => {
    const analysis = analyseTeam({ members: phoenix });
    const tester = candidateFit(analysis, ["Selenium", "Jest"], []);
    const designer = candidateFit(analysis, ["Figma"], []);
    expect(tester.fillsRoles).toEqual(["Testing"]);
    expect(tester.score).toBeGreaterThan(designer.score);
  });

  it("maps skills to areas and categories", () => {
    expect(detectSkillAreas("UI Design")).toContain("UI/UX");
    expect(guessCategory("Git")).toBe("DEVOPS");
    expect(guessCategory("DSA")).toBe("CORE_CS");
  });
});
