/* ==========================================================================
   CampusHub — script.js
   Student Skill, Opportunity & Team Collaboration Platform
   --------------------------------------------------------------------------
   Architecture:  one central `state` object  →  render functions  →  DOM

     1.  Hero heading animation (original behaviour, preserved)
     2.  Constants & configuration
     3.  Demo data (used on first load and by resetCampusHub())
     4.  Central state + localStorage persistence
     5.  Utilities (safe DOM builder, dates, text helpers)
     6.  Engines: profile completion · skill matching · team analysis
     7.  UI infrastructure: component styles · toasts · modal · notifications
     8.  Renderers (one per page section)
     9.  Features: apply · application status · edit profile · group up
    10.  Navigation (smooth scroll + active section)
    11.  Init + window.resetCampusHub()

   No libraries, no backend. Everything is plain Vanilla JavaScript.
   ========================================================================== */

(() => {
  "use strict";

  /* ========================================================================
     1. HERO HEADING ANIMATION  (original behaviour — preserved)
     Splits the hero heading into letters; each letter gets a random colour
     on hover. A data-attribute guard makes sure it can never run twice.
     The heading text is static, trusted markup from index.html.
     ======================================================================== */
  function initHeroAnimation() {
    const heading = document.querySelector(".hero h1");
    if (!heading || heading.dataset.lettersReady === "true") return;
    heading.dataset.lettersReady = "true";

    const colors = [
      "#ff5c8a",
      "#ff9f43",
      "#f9ca24",
      "#6ab04c",
      "#22a6b3",
      "#4834d4",
      "#be2edd"
    ];

    const originalText = heading.textContent.trim();
    const words = originalText.split(" ");

    heading.setAttribute("aria-label", originalText);
    heading.innerHTML = words.map(word => {
      const letters = [...word].map(letter => {
        return `<span class="letter">${letter}</span>`;
      }).join("");

      return `<span class="word">${letters}</span>`;
    }).join(" ");

    heading.querySelectorAll(".letter").forEach(letter => {
      letter.addEventListener("mouseenter", () => {
        const color = colors[Math.floor(Math.random() * colors.length)];
        letter.style.setProperty("--hover-color", color);
      });
    });
  }

  /* ========================================================================
     2. CONSTANTS & CONFIGURATION
     ======================================================================== */
  const STORAGE_KEY = "campushub-state";
  const STATE_VERSION = 1;

  const MAX_SKILLS = 20;
  const MAX_LIST_ITEMS = 15;
  const MAX_MEMBER_SKILLS = 15;
  const MAX_GROUP_SIZE = 10;
  const MIN_GROUP_SIZE = 2;
  const IDEAL_TEAM_SIZE = 5;
  const MAX_NOTIFICATIONS = 40;
  const STRONG_MATCH = 75; // a match of 75%+ counts as a "strong match"

  const NAV_IDS = ["dashboard", "opportunities", "applications", "group-up", "profile"];

  // Which page block belongs to which navbar link (used for the active state)
  const NAV_SECTION_SELECTORS = [
    [".hero", "dashboard"],
    [".dashboard-overview", "dashboard"],
    [".skills-section", "dashboard"],
    ["#opportunities", "opportunities"],
    [".skill-matching-section", "opportunities"],
    ["#applications", "applications"],
    ["#profile", "profile"],
    ["#group-up", "group-up"]
  ];

  const APPLICATION_STATUSES = ["Applied", "Shortlisted", "Interview", "Selected", "Rejected"];

  const STATUS_META = {
    Applied: {
      rgb: "212, 175, 55",
      description: "Application submitted and waiting for review.",
      notify: title => `Your application for ${title} was moved back to Applied.`
    },
    Shortlisted: {
      rgb: "212, 175, 55",
      description: "You cleared the first screening round.",
      notify: title => `Your application for ${title} was shortlisted.`
    },
    Interview: {
      rgb: "245, 215, 110",
      description: "An interview or next round has been scheduled.",
      notify: title => `Interview scheduled for ${title}.`
    },
    Selected: {
      rgb: "45, 212, 191",
      description: "Congratulations, you received an offer!",
      notify: title => `Congratulations! You were selected for ${title}.`
    },
    Rejected: {
      rgb: "239, 68, 68",
      description: "Not selected this time. Keep going!",
      notify: title => `Your application for ${title} was not selected this time.`
    }
  };

  const SKILL_CATEGORIES = ["Programming", "Web", "Database", "Core CS", "AI/ML", "Design", "Testing", "Tools", "Other"];

  // Different spellings of the same skill are mapped to ONE canonical name,
  // so "JS" matches "JavaScript" and "ML" matches "Machine Learning".
  const SKILL_ALIASES = {
    "cpp": "c++",
    "c plus plus": "c++",
    "js": "javascript",
    "ecmascript": "javascript",
    "ts": "typescript",
    "py": "python",
    "python3": "python",
    "ml": "machine learning",
    "ai": "artificial intelligence",
    "dl": "deep learning",
    "oops": "oop",
    "object oriented programming": "oop",
    "object-oriented programming": "oop",
    "data structures": "dsa",
    "data structures and algorithms": "dsa",
    "data structures & algorithms": "dsa",
    "reactjs": "react",
    "react.js": "react",
    "nodejs": "node.js",
    "node": "node.js",
    "expressjs": "express",
    "express.js": "express",
    "vuejs": "vue",
    "vue.js": "vue",
    "nextjs": "next.js",
    "postgres": "postgresql",
    "mongo": "mongodb",
    "ui/ux design": "ui/ux",
    "k8s": "kubernetes",
    "cicd": "ci/cd",
    "ci cd": "ci/cd",
    "golang": "go",
    "sklearn": "scikit-learn"
  };

  // Group Up: the 7 skill areas a project team needs.
  // A skill belongs to an area if its name (or any word in it) is a keyword.
  const TEAM_AREAS = [
    {
      area: "Frontend", role: "Frontend Developer", critical: true, examples: "HTML, CSS, React",
      keywords: ["html", "html5", "css", "css3", "javascript", "typescript", "react", "vue", "angular", "next.js", "svelte", "tailwind", "tailwind css", "bootstrap", "sass", "jquery", "redux", "frontend", "front-end", "web development"]
    },
    {
      area: "Backend", role: "Backend / Systems", critical: true, examples: "C++, Java, Node.js",
      keywords: ["c", "c++", "java", "python", "node.js", "express", "django", "flask", "fastapi", "spring", "spring boot", "php", "laravel", "go", "rust", "c#", ".net", "asp.net", "ruby", "ruby on rails", "kotlin", "rest api", "api", "apis", "graphql", "microservices", "backend", "back-end", "dsa", "oop", "system design"]
    },
    {
      area: "Database", role: "Database Engineer", critical: true, examples: "SQL, MongoDB",
      keywords: ["sql", "mysql", "postgresql", "mongodb", "sqlite", "oracle", "firebase", "supabase", "redis", "dbms", "nosql", "database", "databases", "sql server", "pl/sql", "prisma"]
    },
    {
      area: "AI/ML", role: "AI/ML Engineer", critical: false, examples: "Machine Learning, TensorFlow",
      keywords: ["machine learning", "artificial intelligence", "ai/ml", "deep learning", "tensorflow", "pytorch", "keras", "scikit-learn", "nlp", "computer vision", "opencv", "data science", "data analysis", "pandas", "numpy", "llm", "generative ai", "neural networks"]
    },
    {
      area: "UI/UX", role: "UI/UX Designer", critical: false, examples: "Figma, Wireframing",
      keywords: ["figma", "ui", "ux", "ui/ux", "ui design", "ux design", "ux research", "user research", "wireframing", "prototyping", "adobe xd", "sketch", "canva", "photoshop", "illustrator", "graphic design", "web design", "interaction design"]
    },
    {
      area: "Testing", role: "QA / Testing", critical: false, examples: "Selenium, Jest, Manual Testing",
      keywords: ["testing", "qa", "quality assurance", "selenium", "cypress", "playwright", "jest", "mocha", "junit", "pytest", "postman", "unit testing", "manual testing", "automation testing", "test automation", "tester"]
    },
    {
      area: "DevOps", role: "DevOps Engineer", critical: false, examples: "Git, Docker, CI/CD",
      keywords: ["git", "github", "gitlab", "github actions", "ci/cd", "docker", "kubernetes", "jenkins", "aws", "azure", "gcp", "google cloud", "linux", "bash", "shell scripting", "terraform", "ansible", "nginx", "devops", "cloud", "cloud computing", "deployment"]
    }
  ];

  // If a member's skills tie between two areas, prefer the more specialised one
  // (general languages like Python are common to almost everyone).
  const ROLE_PRIORITY = ["AI/ML", "UI/UX", "Testing", "DevOps", "Database", "Frontend", "Backend"];

  const AREA_TO_CATEGORY = {
    "Frontend": "Web",
    "Backend": "Programming",
    "Database": "Database",
    "AI/ML": "AI/ML",
    "UI/UX": "Design",
    "Testing": "Testing",
    "DevOps": "Tools"
  };

  const CORE_CS_SKILLS = ["dsa", "oop", "algorithms", "operating systems", "computer networks", "discrete mathematics", "compiler design", "theory of computation", "computer architecture"];

  // Profile completion: every section is worth points. Total = 100 points.
  const PROFILE_SECTIONS = [
    { label: "Name", points: 10, isDone: ({ profile }) => hasText(profile.name) },
    { label: "Course", points: 10, isDone: ({ profile }) => hasText(profile.course) },
    { label: "Semester", points: 5, isDone: ({ profile }) => Number(profile.semester) >= 1 },
    { label: "Skills", points: 20, isDone: ({ skills }) => skills.length > 0 },
    { label: "Projects", points: 15, isDone: ({ projects }) => projects.length > 0 },
    { label: "Achievements", points: 10, isDone: ({ achievements }) => achievements.length > 0 },
    { label: "Certifications", points: 10, isDone: ({ certifications }) => certifications.length > 0 },
    { label: "GitHub", points: 10, isDone: ({ profile }) => hasText(profile.github) },
    { label: "LinkedIn", points: 10, isDone: ({ profile }) => hasText(profile.linkedin) }
  ];

  /* ========================================================================
     3. DEMO DATA
     Deadlines are generated relative to today, so the demo never "expires".
     ======================================================================== */
  function createDemoState() {
    return {
      version: STATE_VERSION,

      profile: {
        name: "Ajith",
        course: "Computer Science & Engineering",
        semester: 3,
        github: "https://github.com/ajith-cse",
        linkedin: ""
      },

      skills: [
        { name: "C++", proficiency: 90, category: "Programming" },
        { name: "Python", proficiency: 80, category: "Programming" },
        { name: "JavaScript", proficiency: 70, category: "Web" },
        { name: "SQL", proficiency: 60, category: "Database" },
        { name: "DSA", proficiency: 85, category: "Core CS" },
        { name: "OOP", proficiency: 80, category: "Core CS" },
        { name: "HTML", proficiency: 75, category: "Web" }
      ],

      projects: ["CampusHub", "Student Management System", "DSA Algorithm Visualizer", "Personal Portfolio Website"],
      achievements: ["DSA Lab Achievement", "Hackathon Participant"],
      certifications: ["Python Certification", "Database Fundamentals", "Web Development Basics"],

      opportunities: [
        {
          id: "opp-001",
          title: "C++ Developer Internship",
          organization: "TechNova",
          type: "Internship",
          deadline: daysFromNow(15),
          requiredSkills: ["C++", "DSA", "OOP", "Git"],
          description: "Join TechNova's systems team for a 3-month internship building high-performance C++ services. You will optimise data structures, write unit-tested modules and take part in code reviews with senior engineers.",
          matchScore: 0,
          status: "available"
        },
        {
          id: "opp-002",
          title: "AI/ML Hackathon",
          organization: "Campus AI Club",
          type: "Hackathon",
          deadline: daysFromNow(20),
          requiredSkills: ["Python", "ML", "AI"],
          description: "A 36-hour hackathon to build AI-powered solutions for real campus problems. Teams of 3 to 5 students, with mentors, datasets and cloud credits provided.",
          matchScore: 0,
          status: "available"
        },
        {
          id: "opp-003",
          title: "Full Stack Web Workshop",
          organization: "Tech Community",
          type: "Workshop",
          deadline: daysFromNow(31),
          requiredSkills: ["HTML", "CSS", "JavaScript"],
          description: "A hands-on weekend workshop covering responsive layouts, modern JavaScript and connecting a frontend to a REST API. Ideal for students who want to ship their first full stack project.",
          matchScore: 0,
          status: "available"
        },
        {
          id: "opp-004",
          title: "Web Development Internship",
          organization: "CreativeTech",
          type: "Internship",
          deadline: daysFromNow(12),
          requiredSkills: ["HTML", "CSS", "JavaScript", "React"],
          description: "Work with CreativeTech's product team to build responsive client websites and reusable React components.",
          matchScore: 0,
          status: "available"
        },
        {
          id: "opp-005",
          title: "Cloud Workshop",
          organization: "CloudTech Community",
          type: "Workshop",
          deadline: daysFromNow(-10),
          requiredSkills: ["Linux", "Python", "Cloud Computing"],
          description: "An introductory workshop on cloud fundamentals: virtual machines, storage, deployment and basic Linux administration.",
          matchScore: 0,
          status: "available"
        },
        {
          id: "opp-006",
          title: "Competitive Coding Contest",
          organization: "CodeCraft Society",
          type: "Competition",
          deadline: daysFromNow(-2),
          requiredSkills: ["C++", "DSA", "Problem Solving"],
          description: "A timed inter-college contest with algorithmic problems of increasing difficulty. Registration has closed for this round.",
          matchScore: 0,
          status: "available"
        }
      ],

      applications: [
        { id: "app-003", opportunityId: "opp-002", title: "AI/ML Hackathon", organization: "Campus AI Club", appliedDate: daysFromNow(-5), updatedDate: daysFromNow(-1), status: "Shortlisted" },
        { id: "app-002", opportunityId: "opp-004", title: "Web Development Internship", organization: "CreativeTech", appliedDate: daysFromNow(-9), updatedDate: daysFromNow(-2), status: "Interview" },
        { id: "app-001", opportunityId: "opp-005", title: "Cloud Workshop", organization: "CloudTech Community", appliedDate: daysFromNow(-20), updatedDate: daysFromNow(-6), status: "Selected" }
      ],

      notifications: [
        { id: "ntf-004", message: "Your application for AI/ML Hackathon was shortlisted.", type: "success", link: "#applications", read: false, createdAt: hoursAgo(2) },
        { id: "ntf-003", message: "Interview scheduled for Web Development Internship.", type: "info", link: "#applications", read: false, createdAt: hoursAgo(26) },
        { id: "ntf-002", message: "Congratulations! You were selected for Cloud Workshop.", type: "success", link: "#applications", read: true, createdAt: hoursAgo(24 * 6) },
        { id: "ntf-001", message: "Welcome to CampusHub! Complete your profile to get better matches.", type: "info", link: "#profile", read: true, createdAt: hoursAgo(24 * 21) }
      ],

      group: {
        name: "Team Phoenix",
        createdAt: hoursAgo(24 * 3),
        updatedAt: hoursAgo(24 * 3),
        members: [
          { id: "mem-self", name: "Ajith", role: "", skills: [], isSelf: true },
          { id: "mem-rahul", name: "Rahul", role: "", skills: ["React", "JavaScript", "HTML", "CSS"], isSelf: false },
          { id: "mem-arjun", name: "Arjun", role: "", skills: ["Python", "Machine Learning", "TensorFlow"], isSelf: false },
          { id: "mem-sneha", name: "Sneha", role: "", skills: ["Figma", "UI Design", "Prototyping"], isSelf: false },
          { id: "mem-kiran", name: "Kiran", role: "", skills: ["SQL", "MySQL", "MongoDB"], isSelf: false }
        ]
      },

      ui: { matchingOpportunityId: "opp-001" }
    };
  }

  /* ========================================================================
     4. CENTRAL STATE + PERSISTENCE
     `state` is the single source of truth. The UI is drawn from it.
     ======================================================================== */
  const state = {};
  let loadNotice = "";
  let storageWarningShown = false;

  // localStorage can be blocked (private mode, browser settings) — never crash.
  const storage = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); return true; } catch { return false; }
    },
    remove(key) {
      try { window.localStorage.removeItem(key); } catch { /* storage unavailable */ }
    }
  };

  function saveState() {
    const saved = storage.set(STORAGE_KEY, JSON.stringify(state));
    if (!saved && !storageWarningShown) {
      storageWarningShown = true;
      showToast("Browser storage is unavailable, so changes will be lost after a refresh.", "warning", { duration: 6000 });
    }
    return saved;
  }

  function loadState() {
    const raw = storage.get(STORAGE_KEY);
    if (!raw) return createDemoState();

    try {
      const clean = sanitizeState(JSON.parse(raw));
      if (clean) return clean;
    } catch (error) {
      console.warn("[CampusHub] Saved data could not be parsed.", error);
    }

    loadNotice = "Your saved data was unreadable, so the demo data was restored.";
    storage.remove(STORAGE_KEY);
    return createDemoState();
  }

  // Replace every key of the state object (the object reference never changes).
  function replaceState(nextState) {
    Object.keys(state).forEach(key => delete state[key]);
    Object.assign(state, nextState);
  }

  // Validates data loaded from localStorage. Returns a clean copy, or null if unusable.
  function sanitizeState(data) {
    const listKeys = ["skills", "projects", "achievements", "certifications", "opportunities", "applications", "notifications"];
    if (!data || typeof data !== "object" || data.version !== STATE_VERSION) return null;
    if (!data.profile || typeof data.profile !== "object") return null;
    if (!listKeys.every(key => Array.isArray(data[key]))) return null;

    const opportunities = data.opportunities
      .filter(opp => opp && typeof opp.id === "string" && typeof opp.title === "string" && Array.isArray(opp.requiredSkills))
      .map(opp => ({
        id: opp.id,
        title: opp.title,
        organization: String(opp.organization ?? ""),
        type: String(opp.type ?? "Opportunity"),
        deadline: String(opp.deadline ?? ""),
        requiredSkills: cleanTextList(opp.requiredSkills),
        description: String(opp.description ?? ""),
        matchScore: 0,
        status: "available"
      }));
    if (!opportunities.length) return null;

    const semester = Number(data.profile.semester);

    return {
      version: STATE_VERSION,
      profile: {
        name: String(data.profile.name ?? "").trim(),
        course: String(data.profile.course ?? "").trim(),
        semester: Number.isInteger(semester) && semester >= 1 && semester <= 8 ? semester : "",
        github: normalizeUrl(data.profile.github) || "",
        linkedin: normalizeUrl(data.profile.linkedin) || ""
      },
      skills: data.skills
        .filter(skill => skill && hasText(skill.name))
        .slice(0, MAX_SKILLS)
        .map(skill => ({
          name: skill.name.trim(),
          proficiency: clamp(Math.round(Number(skill.proficiency) || 0), 0, 100),
          category: SKILL_CATEGORIES.includes(skill.category) ? skill.category : "Other"
        })),
      projects: cleanTextList(data.projects),
      achievements: cleanTextList(data.achievements),
      certifications: cleanTextList(data.certifications),
      opportunities,
      applications: data.applications
        .filter(app => app && typeof app.id === "string" && typeof app.opportunityId === "string" && APPLICATION_STATUSES.includes(app.status))
        .map(app => ({
          id: app.id,
          opportunityId: app.opportunityId,
          title: String(app.title ?? "Opportunity"),
          organization: String(app.organization ?? ""),
          appliedDate: String(app.appliedDate ?? todayISO()),
          updatedDate: String(app.updatedDate ?? app.appliedDate ?? todayISO()),
          status: app.status
        })),
      notifications: data.notifications
        .filter(item => item && typeof item.message === "string")
        .slice(0, MAX_NOTIFICATIONS)
        .map(item => ({
          id: typeof item.id === "string" ? item.id : createId("ntf"),
          message: item.message,
          type: ["success", "info", "warning", "error"].includes(item.type) ? item.type : "info",
          link: typeof item.link === "string" && item.link.startsWith("#") ? item.link : "",
          read: Boolean(item.read),
          createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString()
        })),
      group: sanitizeGroup(data.group),
      ui: {
        matchingOpportunityId: typeof data.ui?.matchingOpportunityId === "string" ? data.ui.matchingOpportunityId : opportunities[0].id
      }
    };
  }

  function sanitizeGroup(group) {
    if (!group || typeof group !== "object" || !hasText(group.name) || !Array.isArray(group.members)) return null;
    const validAreas = TEAM_AREAS.map(({ area }) => area);

    return {
      name: group.name.trim(),
      createdAt: typeof group.createdAt === "string" ? group.createdAt : new Date().toISOString(),
      updatedAt: typeof group.updatedAt === "string" ? group.updatedAt : new Date().toISOString(),
      members: group.members
        .filter(member => member && typeof member.name === "string")
        .slice(0, MAX_GROUP_SIZE)
        .map(member => ({
          id: typeof member.id === "string" ? member.id : createId("mem"),
          name: member.name.trim(),
          role: validAreas.includes(member.role) ? member.role : "",
          skills: Array.isArray(member.skills) ? cleanTextList(member.skills).slice(0, MAX_MEMBER_SKILLS) : [],
          isSelf: Boolean(member.isSelf)
        }))
    };
  }

  /* ========================================================================
     5. UTILITIES
     ======================================================================== */
  const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const scrollBehavior = () => (prefersReducedMotion() ? "auto" : "smooth");
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const hasText = value => typeof value === "string" && value.trim().length > 0;
  const pluralize = (count, word, plural = `${word}s`) => `${count} ${count === 1 ? word : plural}`;
  const createId = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  // Runs a function and logs (instead of throwing) if it fails,
  // so one broken section never breaks the whole page.
  function safely(label, fn) {
    try {
      return fn();
    } catch (error) {
      console.error(`[CampusHub] ${label} failed:`, error);
      return undefined;
    }
  }

  function listToSentence(items) {
    if (items.length <= 1) return items.join("");
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  }

  function cleanTextList(list) {
    return list.filter(item => hasText(item)).map(item => item.trim());
  }

  function uniqueBy(items, keyFn) {
    const seen = new Set();
    return items.filter(item => {
      const key = keyFn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // "one per line" textarea → clean array
  const splitLines = text => uniqueBy(cleanTextList(String(text).split(/\r?\n/)), item => item.toLowerCase());

  // "React, CSS, Git" → ["React", "CSS", "Git"]
  const parseSkillList = text =>
    uniqueBy(cleanTextList(String(text ?? "").split(",")), normalizeSkill).slice(0, MAX_MEMBER_SKILLS);

  // Accepts "github.com/user" or a full URL. Only http(s) links are allowed.
  function normalizeUrl(value) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`;
    try {
      const url = new URL(candidate);
      if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  /* ----- Safe DOM builder: user text always goes in as text, never as HTML ----- */
  function el(tag, options = {}, children = []) {
    const { className, text, attrs, props, dataset, style, on } = options;
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    if (attrs) {
      Object.entries(attrs).forEach(([name, value]) => {
        if (value === false || value === null || value === undefined) return;
        node.setAttribute(name, value === true ? "" : String(value));
      });
    }
    if (props) Object.assign(node, props);
    if (dataset) Object.assign(node.dataset, dataset);
    if (style) Object.entries(style).forEach(([prop, value]) => node.style.setProperty(prop, value));
    if (on) Object.entries(on).forEach(([event, handler]) => node.addEventListener(event, handler));

    (Array.isArray(children) ? children : [children]).forEach(child => {
      if (child === null || child === undefined || child === false || child === "") return;
      node.append(child instanceof Node ? child : String(child));
    });

    return node;
  }

  const button = (label, className, onClick, attrs = {}) =>
    el("button", { className: `btn ${className}`, attrs: { type: "button", ...attrs }, text: label, on: onClick ? { click: onClick } : undefined });

  const pill = (label, variant = "") =>
    el("span", { className: `ch-pill${variant ? ` ch-pill-${variant}` : ""}`, text: label });

  const blockTitle = label => el("h3", { className: "ch-block-title", text: label });

  const field = (label, control, hint = "") =>
    el("label", { className: "ch-field" }, [
      el("span", { className: "ch-label", text: label }),
      control,
      hint ? el("span", { className: "ch-hint", text: hint }) : null
    ]);

  const detailTile = (label, value) =>
    el("div", { className: "ch-detail" }, [
      el("span", { className: "ch-detail-label", text: label }),
      el("span", { className: "ch-detail-value" }, value)
    ]);

  function buildSelect(options, selectedValue, className = "ch-input", attrs = {}) {
    const select = el("select", { className, attrs });
    options.forEach(([value, label]) => {
      select.add(new Option(label, value, false, String(value) === String(selectedValue ?? "")));
    });
    return select;
  }

  function emptyState(message, actionLabel = "", actionData = null) {
    return el("div", { className: "ch-empty" }, [
      el("p", { text: message }),
      actionLabel
        ? el("button", { className: "btn btn-secondary ch-btn-sm", attrs: { type: "button" }, dataset: actionData, text: actionLabel })
        : null
    ]);
  }

  // Re-trigger a short highlight animation on an element.
  function flash(node) {
    if (!node) return;
    node.classList.remove("ch-flash");
    void node.offsetWidth; // restart the CSS animation
    node.classList.add("ch-flash");
    node.addEventListener("animationend", () => node.classList.remove("ch-flash"), { once: true });
  }

  // Counts a number up/down smoothly (e.g. 75% → 100%).
  const runningAnimations = new WeakMap();
  function animateNumber(node, target, { suffix = "", duration = 700, onFrame } = {}) {
    if (!node) return;
    const start = parseFloat(node.textContent) || 0;
    cancelAnimationFrame(runningAnimations.get(node));

    if (start === target || prefersReducedMotion()) {
      node.textContent = `${target}${suffix}`;
      onFrame?.(target);
      return;
    }

    const startTime = performance.now();
    const step = now => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = start + (target - start) * eased;
      node.textContent = `${Math.round(value)}${suffix}`;
      onFrame?.(value);
      if (progress < 1) runningAnimations.set(node, requestAnimationFrame(step));
    };
    runningAnimations.set(node, requestAnimationFrame(step));
  }

  /* ----- Dates (deadlines are stored as "YYYY-MM-DD") ----- */
  const pad = number => String(number).padStart(2, "0");
  const toISODate = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const todayISO = () => toISODate(new Date());
  const hoursAgo = hours => new Date(Date.now() - hours * 3600000).toISOString();

  function daysFromNow(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return toISODate(date);
  }

  function parseDate(value) {
    if (typeof value !== "string" || !value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value) {
    const date = parseDate(value);
    return date ? date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "—";
  }

  function daysUntil(value) {
    const date = parseDate(value);
    if (!date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((date - today) / 86400000);
  }

  // A deadline is open until the end of that day.
  function isDeadlinePassed(deadline) {
    const days = daysUntil(deadline);
    return days === null || days < 0;
  }

  function timeAgo(isoString) {
    const seconds = (Date.now() - new Date(isoString).getTime()) / 1000;
    if (!Number.isFinite(seconds)) return "";
    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)}d ago`;
    return formatDate(isoString);
  }

  /* ----- Small state lookups ----- */
  const findOpportunity = id => state.opportunities.find(opp => opp.id === id) ?? null;
  const findApplicationFor = opportunityId => state.applications.find(app => app.opportunityId === opportunityId) ?? null;
  const getSkillNames = () => state.skills.map(skill => skill.name);
  const roleLabel = area => TEAM_AREAS.find(item => item.area === area)?.role ?? "Generalist";
  const matchColor = score => (score >= STRONG_MATCH ? "var(--mint)" : score >= 50 ? "var(--gold)" : "var(--warning)");

  /* ========================================================================
     6. ENGINES
     Simple, deterministic formulas — easy to explain in a viva.
     ======================================================================== */

  /* ----- 6a. Profile completion -----
     Each profile section is worth points (total 100).
     Completion % = points earned ÷ total points × 100                      */
  function calculateProfileCompletion(source = state) {
    const sections = PROFILE_SECTIONS.map(({ label, points, isDone }) => ({
      label,
      points,
      done: Boolean(isDone(source))
    }));
    const earned = sections.reduce((sum, section) => sum + (section.done ? section.points : 0), 0);
    const total = sections.reduce((sum, section) => sum + section.points, 0);
    return { percentage: Math.round((earned / total) * 100), earned, total, sections };
  }

  /* ----- 6b. Skill matching -----
     1. Normalise names ("C++" = "c++", "ML" = "Machine Learning")
     2. Match % = matched required skills ÷ total required skills × 100      */
  function normalizeSkill(skill) {
    const key = String(skill ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    return SKILL_ALIASES[key] ?? key;
  }

  function calculateMatch(studentSkills, requiredSkills) {
    const studentSet = new Set(studentSkills.map(normalizeSkill));
    const matched = [];
    const missing = [];

    requiredSkills.forEach(skill => {
      if (studentSet.has(normalizeSkill(skill))) matched.push(skill);
      else missing.push(skill);
    });

    const percentage = requiredSkills.length ? Math.round((matched.length / requiredSkills.length) * 100) : 0;
    return { matched, missing, percentage, required: requiredSkills.length };
  }

  // Keeps each opportunity's cached matchScore and status in sync with state.
  function refreshOpportunityData() {
    const skillNames = getSkillNames();
    state.opportunities.forEach(opp => {
      opp.matchScore = calculateMatch(skillNames, opp.requiredSkills).percentage;
      opp.status = getOpportunityStatus(opp);
    });
  }

  function getOpportunityStatus(opp) {
    if (findApplicationFor(opp.id)) return "applied";
    if (isDeadlinePassed(opp.deadline)) return "closed";
    return "available";
  }

  /* ----- 6c. Team analysis (Group Up) ----- */
  const AREA_KEYWORDS = new Map(TEAM_AREAS.map(({ area, keywords }) => [area, new Set(keywords.map(normalizeSkill))]));
  const CORE_CS_SET = new Set(CORE_CS_SKILLS.map(normalizeSkill));

  // Which skill areas does one skill belong to? (whole name, or any single word in it)
  function detectSkillAreas(skill) {
    const raw = String(skill ?? "").trim().toLowerCase();
    if (!raw) return [];
    const candidates = [normalizeSkill(raw), ...raw.split(/[\s/,]+/).filter(Boolean).map(normalizeSkill)];
    return TEAM_AREAS
      .filter(({ area }) => candidates.some(candidate => AREA_KEYWORDS.get(area).has(candidate)))
      .map(({ area }) => area);
  }

  // Recommended role = the area that most of a member's skills belong to.
  function recommendRole(skills) {
    const counts = new Map();
    skills.forEach(skill => {
      detectSkillAreas(skill).forEach(area => counts.set(area, (counts.get(area) ?? 0) + 1));
    });
    if (!counts.size) return null;
    const best = Math.max(...counts.values());
    return ROLE_PRIORITY.find(area => counts.get(area) === best) ?? null;
  }

  function guessCategory(skillName) {
    const key = normalizeSkill(skillName);
    if (!key) return "Other";
    if (CORE_CS_SET.has(key)) return "Core CS";
    return AREA_TO_CATEGORY[detectSkillAreas(skillName)[0]] ?? "Other";
  }

  // A team missing a critical role (Frontend/Backend/Database owner) is never "Hackathon Ready".
  function readinessLabel(score, hasCriticalGap = false) {
    if (score >= 85 && !hasCriticalGap) return "Hackathon Ready";
    if (score >= 65) return "Almost Ready";
    if (score >= 40) return "Needs Work";
    return "Just Getting Started";
  }

  /*  Skill Coverage = covered skill areas ÷ 7 × 100
      Readiness      = 40% coverage + 20% team size + 20% role diversity + 20% critical roles
        • team size score      = members ÷ 5            (capped at 100%)
        • role diversity score = different roles ÷ members
        • critical roles score = filled (Frontend, Backend, Database) ÷ 3     */
  function analyseTeam(group) {
    const members = (group?.members ?? []).map(member => {
      const skills = member.isSelf ? getSkillNames() : member.skills;
      const name = member.isSelf ? (state.profile.name || member.name || "You") : member.name;
      const recommendedArea = recommendRole(skills);
      const roleArea = member.role || recommendedArea;
      return {
        ...member,
        name,
        skills,
        recommendedArea,
        roleArea,
        roleLabel: roleLabel(roleArea),
        isAutoRole: !member.role
      };
    });

    // 1. Skill coverage — which areas have at least one team skill?
    const skillsByArea = new Map(TEAM_AREAS.map(({ area }) => [area, new Map()]));
    members.forEach(member => {
      member.skills.forEach(skill => {
        detectSkillAreas(skill).forEach(area => {
          const areaSkills = skillsByArea.get(area);
          const key = normalizeSkill(skill);
          if (!areaSkills.has(key)) areaSkills.set(key, skill);
        });
      });
    });
    const coveredAreas = TEAM_AREAS.filter(({ area }) => skillsByArea.get(area).size > 0);
    const missingAreas = TEAM_AREAS.filter(({ area }) => skillsByArea.get(area).size === 0);
    const coverageExact = (coveredAreas.length / TEAM_AREAS.length) * 100;

    // 2. Roles — which areas have a dedicated owner?
    const filledRoles = new Set(members.map(member => member.roleArea).filter(Boolean));
    const missingRoles = TEAM_AREAS.filter(({ area }) => !filledRoles.has(area));
    const criticalAreas = TEAM_AREAS.filter(({ critical }) => critical);
    const missingCritical = criticalAreas.filter(({ area }) => !filledRoles.has(area));

    // 3. Readiness score
    const sizeScore = Math.min(members.length / IDEAL_TEAM_SIZE, 1) * 100;
    const diversityScore = members.length ? (filledRoles.size / Math.min(members.length, TEAM_AREAS.length)) * 100 : 0;
    const criticalScore = ((criticalAreas.length - missingCritical.length) / criticalAreas.length) * 100;
    const readinessParts = [
      { label: "skill coverage", weight: 0.4, score: coverageExact },
      { label: "team size", weight: 0.2, score: sizeScore },
      { label: "role diversity", weight: 0.2, score: diversityScore },
      { label: "critical roles", weight: 0.2, score: criticalScore }
    ];
    const readiness = Math.round(readinessParts.reduce((sum, part) => sum + part.weight * part.score, 0));

    // 4. Strengths — areas with the most team skills
    const strengths = TEAM_AREAS
      .map(({ area }) => ({ area, count: skillsByArea.get(area).size }))
      .filter(({ count }) => count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const analysis = {
      members,
      skillsByArea,
      coveredAreas,
      missingAreas,
      coverage: Math.round(coverageExact),
      coverageExact,
      filledRoles,
      missingRoles,
      missingCritical,
      readinessParts,
      readiness,
      readinessLabel: readinessLabel(readiness, missingCritical.length > 0),
      strengths
    };

    analysis.summary = buildTeamSummary(analysis);
    analysis.tips = buildTeamTips(analysis);
    return analysis;
  }

  function buildTeamSummary({ members, coveredAreas, missingRoles }) {
    if (!members.length) return "Add members to see how prepared your team is.";
    if (members.length < 3) return "Your team is just getting started. Add more members to build a balanced team.";
    if (!missingRoles.length) return "Your team is well balanced: every key role has a dedicated owner.";

    const covered = new Set(coveredAreas.map(({ area }) => area));
    const strongDevelopment = ["Frontend", "Backend", "Database"].every(area => covered.has(area));
    const opener = strongDevelopment
      ? "Your team has strong development coverage"
      : `Your team covers ${coveredAreas.length} of ${TEAM_AREAS.length} skill areas`;
    const roles = missingRoles.map(({ area }) => area);
    const gap = roles.length === 1
      ? `a dedicated ${roles[0]} role`
      : `dedicated ${listToSentence(roles)} roles`;

    return `${opener} but is missing ${gap}.`;
  }

  function buildTeamTips({ members, missingAreas, missingRoles, missingCritical, filledRoles, skillsByArea }) {
    const tips = [];
    if (!members.length) return tips;

    if (members.length < 3) {
      tips.push(`Add more members. Strong hackathon teams usually have 4 to 6 people (you have ${members.length}).`);
    }
    if (missingCritical.length) {
      tips.push(`Critical gap: nobody owns the ${listToSentence(missingCritical.map(({ role }) => role))} role. Assign a member or invite someone.`);
    }
    missingAreas.slice(0, 3).forEach(({ area, examples }) => {
      tips.push(`No ${area} skills yet. Invite a teammate who knows ${examples}.`);
    });

    const coveredWithoutOwner = missingRoles.filter(({ area, critical }) => !critical && skillsByArea.get(area).size > 0);
    if (coveredWithoutOwner.length) {
      tips.push(`${listToSentence(coveredWithoutOwner.map(({ area }) => area))} skills exist in the team, but no one has it as their main role. Consider assigning an owner.`);
    }

    const roleCounts = new Map();
    members.forEach(({ roleArea }) => roleArea && roleCounts.set(roleArea, (roleCounts.get(roleArea) ?? 0) + 1));
    roleCounts.forEach((count, area) => {
      if (count >= 3 && missingRoles.length) {
        tips.push(`${count} members share the ${area} role. Moving one of them to ${missingRoles[0].area} would balance the team.`);
      }
    });

    if (!tips.length && filledRoles.size) {
      tips.push("Every key area has both skills and an owner. Your team is ready to build!");
    }
    return tips;
  }

  /* ========================================================================
     7. UI INFRASTRUCTURE
     ======================================================================== */

  /* ----- 7a. Component styles -----
     New elements (modal, toasts, notification panel, forms, team insights)
     need a little CSS. It uses ONLY the existing style1.css variables and new
     "ch-" classes, so the existing design is untouched.                     */
  const COMPONENT_CSS = `
/* ===== CampusHub UI components (injected by script.js) ===== */
html.ch-no-scroll { overflow: hidden; scrollbar-gutter: stable; }
.notification-btn, .user-controls { position: relative; }

/* Notifications */
.ch-bell-svg { color: var(--gold); }
.notification-btn.ch-ring .notification-icon { animation: chRing 0.7s var(--ease); }
.ch-notif-badge { position: absolute; top: -5px; right: -5px; display: grid; place-items: center; min-width: 19px; height: 19px; padding: 0 5px; border: 2px solid var(--bg-primary); border-radius: var(--radius-pill); background: var(--gold); color: var(--bg-primary); font-size: 0.66rem; font-weight: 800; line-height: 1; }
.ch-notif-badge[hidden], .ch-notif-panel[hidden], .ch-alert[hidden] { display: none; }
.ch-notif-panel { position: absolute; top: calc(100% + 14px); right: 0; z-index: 120; display: flex; flex-direction: column; width: min(380px, calc(100vw - 32px)); max-height: min(70vh, 520px); overflow: hidden; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-elevated); animation: chPop var(--t-med) var(--ease); }
.ch-notif-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--border-subtle); }
.ch-notif-head h3 { font-size: 1rem; }
.ch-notif-list { overflow-y: auto; overscroll-behavior: contain; }
.ch-notif-item { --notif-color: var(--gold); position: relative; display: flex; flex-direction: column; gap: 3px; width: 100%; padding: 14px 18px 14px 34px; background: transparent; border: 0; border-bottom: 1px solid var(--border-faint); text-align: left; cursor: pointer; transition: background-color var(--t-fast) var(--ease); }
.ch-notif-item:hover { background: rgba(212, 175, 55, 0.05); }
.ch-notif-item::before { content: ""; position: absolute; left: 16px; top: 21px; width: 7px; height: 7px; border-radius: 50%; background: var(--notif-color); opacity: 0.25; }
.ch-notif-item.is-unread::before { opacity: 1; box-shadow: 0 0 8px var(--notif-color); }
.ch-notif-success { --notif-color: var(--mint); }
.ch-notif-warning { --notif-color: var(--warning); }
.ch-notif-error { --notif-color: var(--error); }
.ch-notif-msg { font-size: 0.9rem; line-height: 1.45; color: var(--text-secondary); }
.ch-notif-item.is-unread .ch-notif-msg { color: var(--text-primary); font-weight: 600; }
.ch-notif-time { font-size: 0.76rem; color: var(--text-muted); }
.ch-notif-empty { padding: 32px 18px; text-align: center; font-size: 0.9rem; color: var(--text-muted); }
.ch-link-btn { padding: 0; background: none; border: 0; color: var(--gold); font-size: 0.82rem; font-weight: 600; cursor: pointer; }
.ch-link-btn:hover { color: var(--gold-bright); }
.ch-link-btn:disabled { color: var(--text-muted); cursor: default; }

/* Toasts */
.ch-toast-stack { position: fixed; right: 20px; bottom: 20px; z-index: 1100; display: flex; flex-direction: column; gap: 10px; width: min(380px, calc(100vw - 32px)); pointer-events: none; }
.ch-toast { --toast-color: var(--gold); display: flex; align-items: flex-start; gap: 12px; padding: 14px 14px 14px 16px; background: var(--bg-elevated); border: 1px solid var(--border-card); border-left: 3px solid var(--toast-color); border-radius: var(--radius-md); box-shadow: var(--shadow-elevated); pointer-events: auto; animation: chToastIn var(--t-slow) var(--ease) both; }
.ch-toast.is-leaving { animation: chToastOut var(--t-med) var(--ease) forwards; }
.ch-toast-success { --toast-color: var(--mint); }
.ch-toast-error { --toast-color: var(--error); }
.ch-toast-warning { --toast-color: var(--warning); }
.ch-toast-icon { display: grid; place-items: center; flex: none; width: 22px; height: 22px; margin-top: 1px; border: 1.5px solid currentColor; border-radius: 50%; color: var(--toast-color); font-size: 0.72rem; font-weight: 800; }
.ch-toast-body { flex: 1; min-width: 0; font-size: 0.9rem; line-height: 1.45; }
.ch-toast-body .ch-link-btn { display: inline-block; margin-top: 6px; }
.ch-toast-close { flex: none; padding: 0 2px; background: none; border: 0; color: var(--text-muted); font-size: 1.1rem; line-height: 1; cursor: pointer; }
.ch-toast-close:hover { color: var(--text-primary); }
html.ch-no-scroll .ch-toast-stack { right: auto; left: 20px; } /* keep toasts away from modal buttons */

/* Modal */
.ch-modal-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, 0.72); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); animation: chFade var(--t-med) var(--ease) both; }
.ch-modal-backdrop.is-closing { pointer-events: none; animation: chFadeOut var(--t-fast) var(--ease) forwards; }
.ch-modal { display: flex; flex-direction: column; width: min(640px, 100%); max-height: min(90vh, 900px); overflow: hidden; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-elevated), 0 0 40px rgba(212, 175, 55, 0.06); animation: chModalIn var(--t-slow) var(--ease) both; }
.ch-modal-lg { width: min(820px, 100%); }
.ch-modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 22px 24px 18px; background: radial-gradient(420px 160px at 0 0, rgba(212, 175, 55, 0.08), transparent 70%), var(--bg-elevated); border-bottom: 1px solid var(--border-subtle); }
.ch-modal-heading { min-width: 0; }
.ch-modal-title { font-size: 1.3rem; }
.ch-modal-subtitle { margin-top: 4px; font-size: 0.9rem; color: var(--text-secondary); }
.ch-modal-close { flex: none; font-size: 0.95rem; color: var(--text-secondary); }
.ch-modal-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 24px; }
.ch-modal-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 12px; padding: 16px 24px; background: var(--bg-secondary); border-top: 1px solid var(--border-subtle); }
.ch-footer-note { flex: 1 1 220px; margin-right: auto; font-size: 0.86rem; color: var(--text-secondary); }
.ch-footer-note strong { color: var(--mint); }

/* Forms & layout helpers */
.ch-stack { display: grid; gap: 24px; }
.ch-stack-sm { display: grid; gap: 12px; }
.ch-stack-sm > .btn { justify-self: start; }
.ch-block-title { font-size: 0.875rem; font-weight: 600; color: var(--gold); }
.ch-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 14px; }
.ch-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ch-label { font-size: 0.82rem; font-weight: 600; color: var(--text-secondary); }
.ch-input { width: 100%; padding: 11px 14px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); color: var(--text-primary); font: inherit; font-size: 0.93rem; transition: border-color var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease); }
.ch-input::placeholder { color: var(--text-muted); }
.ch-input:hover { border-color: var(--border); }
.ch-input:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.15); }
.ch-input[readonly] { color: var(--text-secondary); background: var(--bg-secondary); cursor: not-allowed; }
.ch-input[aria-invalid="true"] { border-color: var(--error); box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15); }
textarea.ch-input { min-height: 104px; resize: vertical; line-height: 1.5; }
.ch-hint { font-size: 0.8rem; color: var(--text-muted); }
.ch-alert { padding: 12px 16px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: var(--radius-sm); color: #fca5a5; font-size: 0.88rem; }
.ch-alert-list { margin-top: 6px; gap: 4px; }
.ch-field-error { flex-basis: 100%; font-size: 0.8rem; color: #fca5a5; }
.ch-row-list { display: grid; gap: 10px; }
.ch-row-card { display: grid; gap: 12px; padding: 14px 16px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); }
.ch-skill-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px 12px; }
.ch-skill-row .ch-skill-name { flex: 2 1 150px; }
.ch-skill-row .ch-skill-cat { flex: 1 1 130px; }
.ch-range-wrap { display: flex; flex: 1 1 150px; align-items: center; gap: 10px; }
.ch-range { flex: 1; min-width: 0; accent-color: var(--gold); }
.ch-range-value { min-width: 3.4ch; font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; color: var(--gold); }
.ch-row-head { display: flex; align-items: center; gap: 10px; }
.ch-row-title { font-size: 0.92rem; font-weight: 700; }
.icon-btn.ch-icon-sm { width: 36px; height: 36px; flex: none; font-size: 0.9rem; color: var(--text-secondary); }
.ch-row-head .ch-icon-sm { margin-left: auto; }
.icon-btn.ch-icon-sm:hover:not(:disabled) { border-color: rgba(239, 68, 68, 0.5); background: rgba(239, 68, 68, 0.06); color: var(--error); }
.icon-btn.ch-icon-sm:disabled { opacity: 0.35; cursor: not-allowed; }
.btn.ch-btn-sm { padding: 9px 16px; font-size: 0.86rem; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; filter: none; box-shadow: none; }

/* Pills, chips, detail tiles */
.ch-pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 11px; background: rgba(212, 175, 55, 0.08); border: 1px solid var(--border); border-radius: var(--radius-pill); color: var(--gold); font-size: 0.74rem; font-weight: 600; line-height: 1.5; white-space: nowrap; vertical-align: middle; -webkit-text-fill-color: currentColor; }
.ch-pill-mint { color: var(--mint); background: var(--mint-soft); border-color: var(--mint-border); }
.ch-pill-muted { color: var(--text-secondary); background: rgba(255, 255, 255, 0.04); border-color: rgba(255, 255, 255, 0.1); }
.ch-pill-error { color: var(--error); background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.35); }
.ch-pill-warning { color: var(--warning); background: rgba(245, 158, 11, 0.1); border-color: rgba(245, 158, 11, 0.35); }
.comparison-list li.ch-chip { color: var(--gold-bright); background: rgba(212, 175, 55, 0.08); border-color: var(--border); }
.ch-detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); gap: 12px; }
.ch-detail { min-width: 0; padding: 12px 14px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); }
.ch-detail-label { display: block; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); }
.ch-detail-value { display: block; margin-top: 4px; font-weight: 600; overflow-wrap: anywhere; }
.ch-detail-list { margin-top: 8px; font-size: 0.9rem; }
.ch-text { line-height: 1.7; color: var(--text-secondary); }
.ch-ext-link { color: var(--gold); }
.ch-ext-link:hover { color: var(--gold-bright); text-decoration: underline; }
.ch-formula-line { font-size: 0.86rem; color: var(--text-secondary); }
.ch-formula-line strong { color: var(--gold); }
.ch-section-meta { font-size: 0.95rem; color: var(--text-secondary); }
.ch-skill-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); gap: 12px; }
.ch-skill-cat-label { display: block; margin-top: 10px; font-size: 0.78rem; color: var(--text-muted); }
.ch-muted-item { color: var(--text-muted); font-style: italic; }
.ch-empty { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 32px 20px; text-align: center; color: var(--text-secondary); border: 1px dashed var(--border); border-radius: var(--radius-lg); }

/* Opportunities & matching */
.btn.ch-btn-closed { opacity: 0.55; cursor: not-allowed; }
.btn.ch-btn-closed:hover { transform: none; }
.ch-deadline-note { font-size: 0.85em; color: var(--text-muted); }
.ch-deadline-note.is-urgent { color: var(--warning); }
.ch-match-picker { display: flex; flex-direction: column; gap: 8px; max-width: 380px; margin-top: 6px; }
.demo-skills-comparison .ch-formula-line { margin-top: 16px; }
.demo-skills-comparison .ch-hint { margin-top: 6px; }

/* Application tracker */
.status-rejected { --stage: 4; --accent-rgb: 239, 68, 68; }
.ch-status-trigger { cursor: pointer; transition: background-color var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease); }
.ch-status-trigger::after { content: "\\25BE"; font-size: 0.85em; opacity: 0.8; }
.ch-status-trigger:hover { background: rgba(var(--accent-rgb), 0.2); box-shadow: 0 0 14px rgba(var(--accent-rgb), 0.2); }
.ch-status-options { display: grid; gap: 10px; }
.ch-status-option { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); cursor: pointer; transition: border-color var(--t-fast) var(--ease), background-color var(--t-fast) var(--ease); }
.ch-status-option:hover { border-color: var(--border-hover); }
.ch-status-option.is-selected { border-color: rgb(var(--accent-rgb)); background: rgba(var(--accent-rgb), 0.08); }
.ch-status-option input { margin: 0; accent-color: rgb(var(--accent-rgb)); }
.ch-status-option strong { display: block; font-size: 0.95rem; color: rgb(var(--accent-rgb)); }
.ch-status-option small { font-size: 0.8rem; color: var(--text-muted); }

/* Group Up insights */
.team-preview-card { grid-template-areas: "header header" "members stats" "insights insights" "actions actions"; }
.team-actions { flex-wrap: wrap; gap: 12px; }
.ch-team-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 10px; font-size: 0.95rem; color: var(--text-secondary); }
.ch-team-insights { grid-area: insights; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 16px; }
.ch-insight { display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 20px 22px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); }
.ch-insight .team-subtitle { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 0; }
.ch-insight-wide { grid-column: 1 / -1; }
.ch-recommendation { font-size: 1rem; line-height: 1.6; color: var(--text-primary); }
.ch-member-skills { display: block; margin-top: 3px; font-size: 0.8rem; color: var(--text-muted); }
.ch-member-hint { display: block; margin-top: 2px; font-size: 0.78rem; color: var(--gold-soft); }
.member-list .ch-pill { margin-left: 8px; }
.ch-formula { font-size: 0.86rem; color: var(--text-secondary); }
.ch-formula summary { width: fit-content; font-weight: 600; color: var(--gold); cursor: pointer; }
.ch-formula p { margin-top: 8px; }

.ch-flash { animation: chFlash 1.6s var(--ease); }

@media (max-width: 1023px) {
  .team-preview-card { grid-template-areas: "header" "members" "stats" "insights" "actions"; }
}
@media (max-width: 479px) {
  .ch-toast-stack { right: 12px; left: 12px; bottom: 12px; width: auto; }
  html.ch-no-scroll .ch-toast-stack { right: 12px; left: 12px; top: 12px; bottom: auto; }
  .ch-modal-backdrop { padding: 10px; }
  .ch-modal-header, .ch-modal-body, .ch-modal-footer { padding-inline: 18px; }
  .ch-modal-footer .btn { flex: 1 1 auto; }
}

@keyframes chFade { from { opacity: 0; } }
@keyframes chFadeOut { to { opacity: 0; } }
@keyframes chModalIn { from { opacity: 0; transform: translateY(14px) scale(0.98); } }
@keyframes chPop { from { opacity: 0; transform: translateY(-6px); } }
@keyframes chToastIn { from { opacity: 0; transform: translateY(14px) scale(0.98); } }
@keyframes chToastOut { to { opacity: 0; transform: translateX(24px); } }
@keyframes chFlash { 30% { box-shadow: 0 0 0 2px var(--gold), 0 0 32px rgba(212, 175, 55, 0.3); } }
@keyframes chRing { 20% { transform: rotate(14deg); } 40% { transform: rotate(-12deg); } 60% { transform: rotate(8deg); } 80% { transform: rotate(-4deg); } }
`;

  function injectComponentStyles() {
    if (document.getElementById("campushub-components")) return;
    const style = document.createElement("style");
    style.id = "campushub-components";
    style.textContent = COMPONENT_CSS;
    document.head.append(style);
  }

  /* ----- 7b. Toasts ----- */
  const TOAST_ICONS = { success: "✓", error: "✕", warning: "!", info: "i" };

  function showToast(message, type = "info", { duration = 3800, actionLabel = "", onAction = null } = {}) {
    const toastType = TOAST_ICONS[type] ? type : "info";

    if (!dom.toastStack?.isConnected) {
      dom.toastStack = el("div", { className: "ch-toast-stack", attrs: { "aria-live": "polite" } });
      document.body.append(dom.toastStack);
    }

    let timer = null;
    const dismiss = () => {
      clearTimeout(timer);
      if (toast.classList.contains("is-leaving")) return;
      toast.classList.add("is-leaving");
      setTimeout(() => toast.remove(), 260);
    };
    const startTimer = ms => {
      clearTimeout(timer);
      timer = setTimeout(dismiss, ms);
    };

    const toast = el("div", { className: `ch-toast ch-toast-${toastType}`, attrs: { role: toastType === "error" ? "alert" : "status" } }, [
      el("span", { className: "ch-toast-icon", attrs: { "aria-hidden": "true" }, text: TOAST_ICONS[toastType] }),
      el("div", { className: "ch-toast-body" }, [
        el("p", { text: message }),
        actionLabel && onAction
          ? el("button", {
              className: "ch-link-btn",
              attrs: { type: "button" },
              text: `${actionLabel} →`,
              on: { click: () => { onAction(); dismiss(); } }
            })
          : null
      ]),
      el("button", { className: "ch-toast-close", attrs: { type: "button", "aria-label": "Dismiss notification" }, text: "×", on: { click: dismiss } })
    ]);

    toast.addEventListener("mouseenter", () => clearTimeout(timer));
    toast.addEventListener("mouseleave", () => startTimer(1800));

    dom.toastStack.append(toast);
    while (dom.toastStack.children.length > 4) dom.toastStack.firstElementChild.remove();
    startTimer(duration);
  }

  /* ----- 7c. Reusable modal ----- */
  const modalState = { backdrop: null, dialog: null, returnFocus: null, onClose: null };
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

  function openModal({ title, subtitle = "", body, footer = [], size = "md", initialFocus = null, onClose = null }) {
    // Keep the element that opened the first modal so focus can return to it.
    const returnFocus = modalState.backdrop ? modalState.returnFocus : document.activeElement;
    closeModal({ immediate: true, restoreFocus: false });
    closeNotificationPanel();

    const titleId = createId("ch-modal-title");
    const closeButton = el("button", {
      className: "icon-btn ch-modal-close",
      attrs: { type: "button", "aria-label": "Close dialog" },
      text: "✕",
      on: { click: () => closeModal() }
    });

    const dialog = el("div", { className: `ch-modal ch-modal-${size}`, attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": titleId } }, [
      el("header", { className: "ch-modal-header" }, [
        el("div", { className: "ch-modal-heading" }, [
          el("h2", { className: "ch-modal-title", attrs: { id: titleId }, text: title }),
          subtitle ? el("p", { className: "ch-modal-subtitle", text: subtitle }) : null
        ]),
        closeButton
      ]),
      el("div", { className: "ch-modal-body" }, body),
      footer.length ? el("footer", { className: "ch-modal-footer" }, footer) : null
    ]);

    const backdrop = el("div", { className: "ch-modal-backdrop" }, dialog);

    // Close only when the click starts AND ends on the backdrop (no accidental closes).
    let pressedOnBackdrop = false;
    backdrop.addEventListener("pointerdown", event => { pressedOnBackdrop = event.target === backdrop; });
    backdrop.addEventListener("click", event => {
      if (pressedOnBackdrop && event.target === backdrop) closeModal();
      pressedOnBackdrop = false;
    });
    dialog.addEventListener("keydown", trapFocus);

    document.body.append(backdrop);
    document.documentElement.classList.add("ch-no-scroll");
    setBackgroundInert(true);
    Object.assign(modalState, { backdrop, dialog, returnFocus, onClose });

    const focusTarget = initialFocus ?? dialog.querySelector(".ch-modal-body .ch-input:not([readonly])") ?? closeButton;
    focusTarget.focus({ preventScroll: true });
    return dialog;
  }

  function closeModal({ immediate = false, restoreFocus = true } = {}) {
    const { backdrop, returnFocus, onClose } = modalState;
    if (!backdrop) return;

    Object.assign(modalState, { backdrop: null, dialog: null, returnFocus: null, onClose: null });
    setBackgroundInert(false);
    document.documentElement.classList.remove("ch-no-scroll");

    if (immediate || prefersReducedMotion()) {
      backdrop.remove();
    } else {
      backdrop.classList.add("is-closing");
      setTimeout(() => backdrop.remove(), 170);
    }

    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    onClose?.();
  }

  function trapFocus(event) {
    if (event.key !== "Tab" || !modalState.dialog) return;
    const items = [...modalState.dialog.querySelectorAll(FOCUSABLE)].filter(node => node.offsetParent !== null);
    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // While a modal is open, the page behind it cannot be clicked or focused.
  function setBackgroundInert(isInert) {
    [dom.header, dom.main, dom.footer].forEach(node => {
      if (node) node.inert = isInert;
    });
  }

  /* ----- Form error helpers (shared by all modal forms) ----- */
  function clearFormErrors(form, alertBox) {
    form.querySelectorAll("[aria-invalid]").forEach(node => node.removeAttribute("aria-invalid"));
    form.querySelectorAll(".ch-field-error").forEach(node => node.remove());
    alertBox.hidden = true;
    alertBox.replaceChildren();
  }

  // Shows a summary at the top of the form AND a message under each invalid field.
  function showFormErrors(errors, alertBox) {
    errors.forEach(({ input, message }) => {
      if (!input || !["INPUT", "SELECT", "TEXTAREA"].includes(input.tagName)) return;
      input.setAttribute("aria-invalid", "true");
      input.closest(".ch-field, .ch-row-card")?.append(el("span", { className: "ch-field-error", text: message }));
    });
    alertBox.replaceChildren(
      el("strong", { text: errors.length === 1 ? "Please fix this:" : `Please fix these ${errors.length} issues:` }),
      el("ul", { className: "bullet-list ch-alert-list" }, errors.map(({ message }) => el("li", { text: message })))
    );
    alertBox.hidden = false;
    const firstInput = errors.find(({ input }) => input)?.input;
    if (firstInput) firstInput.focus();
    else alertBox.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  }

  // Typing in a field clears its error message.
  function clearFieldError(event) {
    const target = event.target;
    if (!target?.removeAttribute) return;
    target.removeAttribute("aria-invalid");
    target.closest(".ch-field, .ch-row-card")?.querySelector(".ch-field-error")?.remove();
  }

  /* ----- 7d. Notification centre ----- */
  const notifUi = { open: false, panel: null, list: null, badge: null, markAll: null };

  function addNotification(message, type = "info", link = "") {
    state.notifications.unshift({
      id: createId("ntf"),
      message,
      type,
      link,
      read: false,
      createdAt: new Date().toISOString()
    });
    state.notifications.splice(MAX_NOTIFICATIONS);
    renderNotifications();
    ringBell();
  }

  function ringBell() {
    const bell = dom.notifBtn;
    if (!bell) return;
    bell.classList.remove("ch-ring");
    void bell.offsetWidth;
    bell.classList.add("ch-ring");
    setTimeout(() => bell.classList.remove("ch-ring"), 800);
  }

  function initNotifications() {
    const bell = dom.notifBtn;
    if (!bell) return;

    bell.type = "button";
    bell.setAttribute("aria-expanded", "false");
    bell.setAttribute("aria-controls", "ch-notif-panel");

    notifUi.badge = el("span", { className: "ch-notif-badge", attrs: { "aria-hidden": "true", hidden: true } });
    bell.append(notifUi.badge);

    notifUi.markAll = el("button", { className: "ch-link-btn", attrs: { type: "button" }, text: "Mark all as read" });
    notifUi.list = el("ul", { className: "ch-notif-list" });
    notifUi.panel = el("div", { className: "ch-notif-panel", attrs: { id: "ch-notif-panel", role: "dialog", "aria-label": "Notifications", hidden: true } }, [
      el("div", { className: "ch-notif-head" }, [el("h3", { text: "Notifications" }), notifUi.markAll]),
      notifUi.list
    ]);
    (dom.userControls ?? bell.parentElement).append(notifUi.panel);

    bell.addEventListener("click", () => (notifUi.open ? closeNotificationPanel() : openNotificationPanel()));
    notifUi.markAll.addEventListener("click", markAllNotificationsRead);
    notifUi.list.addEventListener("click", handleNotificationClick);

    // Click outside closes the panel. composedPath() still works if the
    // clicked item was re-rendered (removed) during the click.
    document.addEventListener("click", event => {
      if (!notifUi.open) return;
      const path = event.composedPath();
      if (!path.includes(notifUi.panel) && !path.includes(bell)) closeNotificationPanel();
    });
  }

  function openNotificationPanel() {
    if (!notifUi.panel) return;
    renderNotifications(); // refreshes the "5m ago" labels
    notifUi.panel.hidden = false;
    notifUi.open = true;
    dom.notifBtn?.setAttribute("aria-expanded", "true");
  }

  function closeNotificationPanel() {
    if (!notifUi.open || !notifUi.panel) return;
    notifUi.panel.hidden = true;
    notifUi.open = false;
    dom.notifBtn?.setAttribute("aria-expanded", "false");
  }

  function handleNotificationClick(event) {
    const item = event.target.closest("[data-notif-id]");
    if (!item) return;
    const notification = state.notifications.find(entry => entry.id === item.dataset.notifId);
    if (!notification) return;

    if (!notification.read) {
      notification.read = true;
      saveState();
    }
    renderNotifications();

    const targetId = notification.link?.slice(1);
    if (targetId && document.getElementById(targetId)) {
      closeNotificationPanel();
      scrollToSection(targetId);
    }
  }

  function markAllNotificationsRead() {
    const unread = state.notifications.filter(entry => !entry.read);
    if (!unread.length) return;
    unread.forEach(entry => { entry.read = true; });
    saveState();
    renderNotifications();
    showToast("All notifications marked as read.", "info");
  }

  /* ----- Image fallbacks (if an assets/ placeholder image is missing) ----- */
  function onImageFail(img, fallback) {
    let handled = false;
    const run = () => {
      if (handled) return;
      handled = true;
      fallback();
    };
    img.addEventListener("error", run, { once: true });
    if (img.complete && typeof img.decode === "function") img.decode().catch(run);
  }

  function initialsAvatar(name) {
    const initials = String(name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(word => [...word][0] ?? "")
      .join("")
      .toUpperCase()
      .replace(/[^\p{L}\p{N}]/gu, "") || "CH";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#151515"/><text x="50" y="50" dy=".35em" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="38" font-weight="700" fill="#d4af37">${initials}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function createBellIcon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    const attributes = {
      viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8",
      "stroke-linecap": "round", "stroke-linejoin": "round", class: "notification-icon ch-bell-svg", "aria-hidden": "true"
    };
    Object.entries(attributes).forEach(([name, value]) => svg.setAttribute(name, value));
    ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0"].forEach(d => {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      svg.append(path);
    });
    return svg;
  }

  function initImageFallbacks() {
    const bellImage = dom.notifBtn?.querySelector("img");
    if (bellImage) onImageFail(bellImage, () => bellImage.replaceWith(createBellIcon()));

    [dom.avatar, dom.profile.image].forEach(img => {
      if (!img) return;
      onImageFail(img, () => {
        img.dataset.fallback = "initials";
        img.src = initialsAvatar(state.profile.name);
      });
    });
  }

  /* ========================================================================
     8. RENDERERS  (state → DOM)
     ======================================================================== */
  const dom = {};

  // Look up every important element ONCE and keep the reference.
  function cacheDom() {
    const $ = selector => document.querySelector(selector);

    Object.assign(dom, {
      header: $(".site-header"),
      main: $(".main-content"),
      footer: $(".site-footer"),
      navbar: $(".navbar"),
      navLinks: [...document.querySelectorAll('.nav-links a[href^="#"]')],
      notifBtn: $(".notification-btn"),
      userControls: $(".user-controls"),
      avatar: $(".user-avatar"),
      stats: {},
      skillsList: $(".skills-list"),
      oppGrid: $(".opportunities-grid"),
      oppHeader: $("#opportunities .section-header"),
      trackerList: $(".tracker-list"),
      trackerHeader: $("#applications .section-header"),
      matching: {
        section: $(".skill-matching-section"),
        header: $(".matching-content .section-header"),
        card: $(".demo-match-card"),
        role: $(".demo-role"),
        comparison: $(".demo-skills-comparison"),
        list: $(".comparison-list"),
        circle: $(".score-circle"),
        value: $(".score-value")
      },
      profile: {
        editBtn: $(".profile-actions-top .btn"),
        fullBtn: $(".profile-footer .btn"),
        image: $(".profile-image"),
        name: $(".profile-name"),
        course: $(".profile-course"),
        semester: $(".profile-semester"),
        sections: {}
      },
      team: {
        card: $(".team-preview-card"),
        header: $(".team-header"),
        name: $(".team-name"),
        subtitle: $(".team-members .team-subtitle"),
        members: $(".member-list"),
        stats: [...document.querySelectorAll(".team-stats .team-stat")],
        actions: $(".team-actions"),
        createBtn: $(".team-actions .btn")
      }
    });

    // Dashboard stat cards are found by their title text.
    const statKeys = {
      "profile completion": "completion",
      "skills": "skills",
      "projects": "projects",
      "applications": "applications",
      "certifications": "certifications"
    };
    document.querySelectorAll(".stats-grid .stat-card").forEach(card => {
      const key = statKeys[card.querySelector(".stat-title")?.textContent.trim().toLowerCase()];
      const value = card.querySelector(".stat-value");
      if (key && value) dom.stats[key] = value;
    });

    // Profile sections are found by their heading text (Skills, Projects, ...).
    document.querySelectorAll(".profile-body .profile-section").forEach(section => {
      const key = section.querySelector("h4")?.textContent.trim().toLowerCase();
      if (key) dom.profile.sections[key] = section;
    });
  }

  function renderAll() {
    safely("dashboard", renderDashboard);
    safely("skills", renderSkills);
    safely("opportunities", renderOpportunities);
    safely("skill matching", renderMatching);
    safely("application tracker", renderTracker);
    safely("profile", renderProfile);
    safely("group up", renderTeam);
    safely("notifications", renderNotifications);
  }

  /* ----- 8a. Dashboard ----- */
  function updateDashboardStats() {
    const completion = calculateProfileCompletion();
    const values = {
      completion: completion.percentage,
      skills: state.skills.length,
      projects: state.projects.length,
      applications: state.applications.length,
      certifications: state.certifications.length
    };
    Object.entries(values).forEach(([key, value]) => {
      animateNumber(dom.stats[key], value, { suffix: key === "completion" ? "%" : "" });
    });
    return completion;
  }

  function renderDashboard() {
    const completion = updateDashboardStats();
    const card = dom.stats.completion?.closest(".stat-card");
    if (card) {
      const missing = completion.sections.filter(({ done }) => !done).map(({ label }) => label);
      card.title = missing.length ? `Add ${listToSentence(missing)} to reach 100%` : "Your profile is complete!";
    }
  }

  /* ----- 8b. My Skills ----- */
  function renderSkills() {
    if (!dom.skillsList) return;
    if (!state.skills.length) {
      dom.skillsList.replaceChildren(emptyState("You haven't added any skills yet.", "Add Skills", { action: "edit-profile" }));
      return;
    }
    dom.skillsList.replaceChildren(...state.skills.map(buildSkillCard));
  }

  function buildSkillCard(skill) {
    return el("div", { className: "skill-item" }, [
      el("div", { className: "skill-info" }, [
        el("span", { className: "skill-name", text: skill.name }),
        el("span", { className: "skill-percentage", text: `${skill.proficiency}%` })
      ]),
      el("progress", {
        className: "skill-progress",
        attrs: { max: 100, "aria-label": `${skill.name} proficiency ${skill.proficiency}%` },
        props: { value: skill.proficiency }
      }),
      el("span", { className: "ch-skill-cat-label", text: skill.category })
    ]);
  }

  /* ----- 8c. Recommended Opportunities ----- */
  // Open opportunities first (best match first), past deadlines last.
  const compareOpportunities = (a, b) =>
    Number(isDeadlinePassed(a.deadline)) - Number(isDeadlinePassed(b.deadline)) ||
    b.matchScore - a.matchScore ||
    a.deadline.localeCompare(b.deadline);

  function renderOpportunities() {
    if (!dom.oppGrid) return;
    const sorted = [...state.opportunities].sort(compareOpportunities);
    dom.oppGrid.replaceChildren(...sorted.map(buildOpportunityCard));
    if (!sorted.length) dom.oppGrid.append(emptyState("No opportunities right now. Check back soon!"));
    updateOpportunityMeta();
  }

  function updateOpportunityMeta() {
    if (!dom.oppMeta) return;
    const open = state.opportunities.filter(({ status }) => status === "available").length;
    const applied = state.opportunities.filter(({ status }) => status === "applied").length;
    dom.oppMeta.textContent = `${open} open · ${applied} applied · ranked by how well your skills match`;
  }

  function applyButtonConfig(opp) {
    if (opp.status === "applied") return { text: "✓ Applied", className: "btn btn-success", title: "You have already applied" };
    if (opp.status === "closed") return { text: "Closed", className: "btn btn-secondary ch-btn-closed", title: "The deadline has passed", disabled: true };
    return { text: "Apply", className: "btn btn-primary", title: `Apply to ${opp.title}` };
  }

  function deadlineNote(opp) {
    const days = daysUntil(opp.deadline);
    if (opp.status === "closed" || days === null || days < 0) return { text: "Closed", urgent: false };
    if (days === 0) return { text: "Closes today", urgent: true };
    return { text: `${pluralize(days, "day")} left`, urgent: days <= 5 };
  }

  function buildOpportunityCard(opp) {
    const note = deadlineNote(opp);
    const apply = applyButtonConfig(opp);
    const detailRow = (label, value) => el("p", {}, [el("strong", { text: label }), el("span", {}, value)]);

    return el("article", { className: "opportunity-card", dataset: { id: opp.id } }, [
      el("header", { className: "opportunity-header" }, [
        el("h3", { className: "opportunity-title", text: opp.title }),
        el("p", { className: "opportunity-org", text: `Organization: ${opp.organization}` })
      ]),
      el("div", { className: "opportunity-details" }, [
        detailRow("Type:", opp.type),
        detailRow("Deadline:", [
          formatDate(opp.deadline), " ",
          el("span", { className: `ch-deadline-note${note.urgent ? " is-urgent" : ""}`, text: `· ${note.text}` })
        ]),
        detailRow("Required Skills:", opp.requiredSkills.join(", "))
      ]),
      el("div", {
        className: "match-score-container",
        style: { "--match": String(opp.matchScore), "--match-color": matchColor(opp.matchScore) }
      }, el("p", { className: "match-score", attrs: { "aria-label": `Skill Match ${opp.matchScore}%` }, text: `Match: ${opp.matchScore}%` })),
      el("footer", { className: "opportunity-actions" }, [
        el("button", {
          className: "btn btn-secondary",
          attrs: { type: "button", "aria-label": `View details for ${opp.title}` },
          dataset: { action: "view-opportunity" },
          text: "View Details"
        }),
        el("button", {
          className: apply.className,
          attrs: { type: "button", title: apply.title, "aria-disabled": apply.disabled ? "true" : null },
          dataset: { action: "apply" },
          text: apply.text
        })
      ])
    ]);
  }

  // Targeted update: rebuild ONE card instead of the whole grid.
  function updateOpportunityCard(id) {
    const opp = findOpportunity(id);
    const card = dom.oppGrid?.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!opp || !card) {
      renderOpportunities();
      return;
    }
    const hadFocus = card.contains(document.activeElement);
    const freshCard = buildOpportunityCard(opp);
    card.replaceWith(freshCard);
    flash(freshCard);
    if (hadFocus) freshCard.querySelector('[data-action="apply"]')?.focus({ preventScroll: true });
    updateOpportunityMeta();
  }

  /* ----- 8d. Skill Matching demo section ----- */
  function initMatchingUi() {
    const m = dom.matching;
    if (!m.card) return;

    if (m.header) {
      m.picker = el("select", { className: "ch-input", attrs: { "aria-label": "Choose an opportunity to compare with your skills" } });
      m.header.append(el("label", { className: "ch-match-picker" }, [
        el("span", { className: "ch-label", text: "Compare your skills with:" }),
        m.picker
      ]));
      m.picker.addEventListener("change", () => {
        state.ui.matchingOpportunityId = m.picker.value;
        saveState();
        renderMatching();
      });
    }

    if (m.comparison) {
      m.formula = el("p", { className: "ch-formula-line" });
      m.tip = el("p", { className: "ch-hint" });
      m.comparison.append(m.formula, m.tip);
    }
  }

  function buildComparisonItems(requiredSkills, result) {
    const matchedKeys = new Set(result.matched.map(normalizeSkill));
    return requiredSkills.map(skill => {
      const isMatch = matchedKeys.has(normalizeSkill(skill));
      return el("li", { className: isMatch ? "match-success" : "match-fail" }, [
        el("span", { attrs: { "aria-hidden": "true" }, text: isMatch ? "✓" : "✗" }),
        el("span", { className: "sr-only", text: isMatch ? "Matched:" : "Missing:" }),
        ` ${skill}`
      ]);
    });
  }

  function buildMatchFormula({ matched, required, percentage }) {
    if (!required) return ["This opportunity has no specific skill requirements."];
    return [
      "You have ",
      el("strong", { text: String(matched.length) }),
      ` of ${required} required skills → ${matched.length} ÷ ${required} × 100 = `,
      el("strong", { text: `${percentage}%` })
    ];
  }

  function renderMatching() {
    const m = dom.matching;
    if (!m.card) return;
    const opp = findOpportunity(state.ui.matchingOpportunityId) ?? state.opportunities[0];
    if (!opp) return;

    const result = calculateMatch(getSkillNames(), opp.requiredSkills);

    if (m.role) m.role.textContent = opp.title;
    if (m.list) m.list.replaceChildren(...buildComparisonItems(opp.requiredSkills, result));
    if (m.formula) m.formula.replaceChildren(...buildMatchFormula(result));
    if (m.tip) {
      m.tip.textContent = result.missing.length
        ? `Tip: add ${listToSentence(result.missing)} to your profile to reach 100%.`
        : "You meet every requirement for this opportunity!";
    }
    if (m.value) {
      animateNumber(m.value, result.percentage, {
        suffix: "%",
        onFrame: value => m.circle?.style.setProperty("--score", value.toFixed(1))
      });
    }

    if (m.picker) {
      if (m.picker.options.length !== state.opportunities.length) {
        m.picker.replaceChildren(...state.opportunities.map(({ id }) => new Option("", id)));
      }
      [...m.picker.options].forEach((option, index) => {
        const item = state.opportunities[index];
        option.value = item.id;
        option.textContent = `${item.title} — ${item.matchScore}% match`;
      });
      m.picker.value = opp.id;
    }
  }

  /* ----- 8e. Application Tracker ----- */
  function initSectionMeta() {
    if (dom.oppHeader) {
      dom.oppMeta = el("p", { className: "ch-section-meta" });
      dom.oppHeader.append(dom.oppMeta);
    }
    if (dom.trackerHeader) {
      dom.trackerMeta = el("p", { className: "ch-section-meta" });
      dom.trackerHeader.append(dom.trackerMeta);
    }
  }

  function renderTracker({ flashId = "" } = {}) {
    if (!dom.trackerList) return;

    if (!state.applications.length) {
      dom.trackerList.replaceChildren(emptyState("No applications yet. Find an opportunity that matches your skills!", "Explore Opportunities", { action: "go-to", target: "opportunities" }));
    } else {
      dom.trackerList.replaceChildren(...state.applications.map(buildTrackerItem));
      if (flashId) flash(dom.trackerList.querySelector(`[data-id="${CSS.escape(flashId)}"]`));
    }

    if (dom.trackerMeta) {
      const counts = APPLICATION_STATUSES
        .map(status => [status, state.applications.filter(app => app.status === status).length])
        .filter(([, count]) => count > 0)
        .map(([status, count]) => `${count} ${status}`);
      dom.trackerMeta.textContent = state.applications.length
        ? `${pluralize(state.applications.length, "application")}: ${counts.join(" · ")}. Click a status badge to update it.`
        : "Applications you submit will appear here.";
    }
  }

  function buildTrackerItem(app) {
    return el("article", { className: `tracker-item status-${app.status.toLowerCase()}`, dataset: { id: app.id } }, [
      el("div", { className: "tracker-info" }, [
        el("h3", { className: "tracker-role", text: app.title }),
        el("p", { className: "tracker-org", text: `${app.organization} · Applied ${formatDate(app.appliedDate)}` })
      ]),
      el("div", { className: "tracker-status" }, el("button", {
        className: "status-badge ch-status-trigger",
        attrs: {
          type: "button",
          title: "Click to update status",
          "aria-label": `Update status for ${app.title}. Current status: ${app.status}`
        },
        dataset: { action: "update-status" },
        text: `Status: ${app.status}`
      }))
    ]);
  }

  /* ----- 8f. Student Profile ----- */
  function renderBulletList(section, items, emptyText) {
    const list = section?.querySelector(".bullet-list");
    if (!list) return;
    list.replaceChildren(...(items.length
      ? items.map(text => el("li", { text }))
      : [el("li", { className: "ch-muted-item", text: emptyText })]));
  }

  function renderProfileLinks(section) {
    const list = section?.querySelector(".inline-list");
    if (!list) return;
    const links = [["GitHub", state.profile.github], ["LinkedIn", state.profile.linkedin]];

    list.replaceChildren(...links.map(([label, url]) => el("li", {}, url
      ? el("a", { attrs: { href: url, target: "_blank", rel: "noopener noreferrer", title: url }, text: label })
      : el("a", {
          className: "ch-muted-item",
          attrs: { href: "#profile", title: `Add your ${label} link` },
          dataset: { action: "edit-profile" },
          text: `+ Add ${label}`
        }))));
  }

  function renderProfile() {
    const p = dom.profile;
    const { profile } = state;

    if (p.name) p.name.textContent = profile.name || "Your Name";
    if (p.course) p.course.textContent = profile.course || "Add your course";
    if (p.semester) p.semester.textContent = `Semester: ${profile.semester || "Not specified"}`;

    [p.image, dom.avatar].forEach(img => {
      if (img?.dataset.fallback === "initials") img.src = initialsAvatar(profile.name);
    });
    if (p.image) p.image.alt = `${profile.name || "Student"}'s Profile Picture`;

    const skillsText = p.sections.skills?.querySelector("p");
    if (skillsText) {
      skillsText.textContent = state.skills.length
        ? getSkillNames().join(", ")
        : "No skills added yet. Click Edit Profile to add some.";
    }

    renderBulletList(p.sections.projects, state.projects, "No projects added yet");
    renderBulletList(p.sections.achievements, state.achievements, "No achievements added yet");
    renderBulletList(p.sections.certifications, state.certifications, "No certifications added yet");
    renderProfileLinks(p.sections.links);
  }

  /* ----- 8g. Group Up ----- */
  function initTeamUi() {
    const { team } = dom;
    if (!team.card) return;

    team.meta = el("p", { className: "ch-team-meta" });
    team.header?.append(team.meta);

    team.insights = el("div", { className: "ch-team-insights" });
    if (team.actions) team.card.insertBefore(team.insights, team.actions);
    else team.card.append(team.insights);

    team.editBtn = el("button", {
      className: "btn btn-secondary",
      attrs: { type: "button" },
      dataset: { action: "edit-group" },
      text: "Edit Group"
    });
    team.actions?.append(team.editBtn);
  }

  function buildMemberItem(member) {
    const showSuggestion = !member.isAutoRole && member.recommendedArea && member.recommendedArea !== member.roleArea;
    return el("li", {}, [
      el("strong", { text: member.name || "Unnamed" }),
      ` — ${member.roleLabel}`,
      member.isSelf ? pill("You", "mint") : null,
      el("span", { className: "ch-member-skills", text: member.skills.length ? member.skills.join(" · ") : "No skills listed" }),
      showSuggestion ? el("span", { className: "ch-member-hint", text: `Skills suggest: ${roleLabel(member.recommendedArea)}` }) : null
    ]);
  }

  function setTeamStat(index, value) {
    const stat = dom.team.stats[index];
    if (!stat) return;
    stat.style.setProperty("--pct", String(value));
    animateNumber(stat.querySelector(".stat-value"), value, { suffix: "%" });
  }

  const READINESS_VARIANTS = { "Hackathon Ready": "mint", "Almost Ready": "", "Needs Work": "warning", "Just Getting Started": "error" };
  const readinessVariant = label => READINESS_VARIANTS[label] ?? "";

  function renderTeam({ highlight = false } = {}) {
    const { team } = dom;
    if (!team.card) return;

    const group = state.group;
    const analysis = analyseTeam(group);

    if (team.name) team.name.textContent = group?.name ?? "No team yet";
    if (team.meta) {
      team.meta.replaceChildren(...(group
        ? [pluralize(analysis.members.length, "member"), pill(analysis.readinessLabel, readinessVariant(analysis.readinessLabel))]
        : ["Create a group to see how prepared your team is."]));
    }
    if (team.subtitle) team.subtitle.textContent = `Members (${analysis.members.length}/${MAX_GROUP_SIZE}):`;
    if (team.members) {
      team.members.replaceChildren(...(analysis.members.length
        ? analysis.members.map(buildMemberItem)
        : [el("li", { text: "No members yet. Click Create a Group to start." })]));
    }

    setTeamStat(0, analysis.coverage);
    setTeamStat(1, analysis.readiness);
    renderTeamInsights(analysis, Boolean(group));
    if (team.editBtn) team.editBtn.style.display = group ? "" : "none";
    if (highlight) flash(team.card);
  }

  function renderTeamInsights(analysis, hasGroup) {
    const box = dom.team.insights;
    if (!box) return;
    if (!hasGroup) {
      box.replaceChildren();
      return;
    }

    const chip = (label, className, title = "") =>
      el("li", { className, attrs: { title: title || null } }, [
        el("span", { attrs: { "aria-hidden": "true" }, text: className === "match-fail" ? "✗" : "✓" }),
        ` ${label}`
      ]);

    const coverageChips = TEAM_AREAS.map(({ area }) => {
      const skills = [...analysis.skillsByArea.get(area).values()];
      return skills.length
        ? chip(area, "match-success", `Covered by: ${skills.join(", ")}`)
        : chip(area, "match-fail", "No team member has these skills yet");
    });

    const strengthChips = analysis.strengths.length
      ? analysis.strengths.map(({ area, count }) => el("li", { className: "ch-chip" }, `${area} · ${count} skills`))
      : [el("li", { className: "ch-chip" }, "Add more skills to reveal strengths")];

    const missingRoleChips = analysis.missingRoles.length
      ? analysis.missingRoles.map(({ role }) => chip(role, "match-fail"))
      : [chip("Every role has an owner", "match-success")];

    const parts = analysis.readinessParts
      .map(({ weight, score }) => `${weight} × ${score.toFixed(1)}`)
      .join(" + ");

    box.replaceChildren(
      el("section", { className: "ch-insight" }, [
        el("h4", { className: "team-subtitle", text: `Skill Area Coverage (${analysis.coveredAreas.length}/${TEAM_AREAS.length})` }),
        el("ul", { className: "comparison-list" }, coverageChips)
      ]),
      el("section", { className: "ch-insight" }, [
        el("h4", { className: "team-subtitle", text: "Team Strengths" }),
        el("ul", { className: "comparison-list" }, strengthChips),
        el("h4", { className: "team-subtitle", text: "Missing Roles" }),
        el("ul", { className: "comparison-list" }, missingRoleChips)
      ]),
      el("section", { className: "ch-insight ch-insight-wide" }, [
        el("h4", { className: "team-subtitle" }, ["CampusHub Recommendation", pill(analysis.readinessLabel, readinessVariant(analysis.readinessLabel))]),
        el("p", { className: "ch-recommendation", text: analysis.summary }),
        analysis.tips.length ? el("ul", { className: "bullet-list" }, analysis.tips.map(tip => el("li", { text: tip }))) : null,
        el("details", { className: "ch-formula" }, [
          el("summary", { text: "How are these scores calculated?" }),
          el("p", { text: `Team Skill Coverage = covered skill areas ÷ ${TEAM_AREAS.length} × 100 = ${analysis.coveredAreas.length} ÷ ${TEAM_AREAS.length} × 100 = ${analysis.coverage}%` }),
          el("p", { text: "Team Readiness = 40% skill coverage + 20% team size + 20% role diversity + 20% critical roles" }),
          el("p", { text: `= ${parts} = ${analysis.readiness}%` }),
          el("p", { text: `Team size = members ÷ ${IDEAL_TEAM_SIZE} (max 100%). Role diversity = different roles ÷ members. Critical roles = Frontend, Backend and Database owners ÷ 3. Roles are detected from each member's skills.` })
        ])
      ])
    );
  }

  /* ----- 8h. Notifications ----- */
  function buildNotificationItem(notification) {
    return el("li", {}, el("button", {
      className: `ch-notif-item ch-notif-${notification.type}${notification.read ? "" : " is-unread"}`,
      attrs: { type: "button" },
      dataset: { notifId: notification.id }
    }, [
      el("span", { className: "ch-notif-msg", text: notification.message }),
      el("span", { className: "ch-notif-time", text: `${timeAgo(notification.createdAt)}${notification.read ? "" : " · New"}` })
    ]));
  }

  function renderNotifications() {
    const unread = state.notifications.filter(({ read }) => !read).length;

    if (notifUi.badge) {
      notifUi.badge.hidden = unread === 0;
      notifUi.badge.textContent = unread > 9 ? "9+" : String(unread);
    }
    dom.notifBtn?.setAttribute("aria-label", unread ? `Notifications (${unread} unread)` : "Notifications");
    if (notifUi.markAll) notifUi.markAll.disabled = unread === 0;
    if (!notifUi.list) return;

    notifUi.list.replaceChildren(...(state.notifications.length
      ? state.notifications.map(buildNotificationItem)
      : [el("li", { className: "ch-notif-empty", text: "You're all caught up. No notifications yet." })]));
  }

  /* ========================================================================
     9. FEATURES
     ======================================================================== */

  /* ----- 9a. View Details ----- */
  function openOpportunityModal(id) {
    const opp = findOpportunity(id);
    if (!opp) {
      showToast("Sorry, that opportunity could not be found.", "error");
      return;
    }

    const result = calculateMatch(getSkillNames(), opp.requiredSkills);
    const application = findApplicationFor(opp.id);
    const note = deadlineNote(opp);
    const apply = applyButtonConfig(opp);

    const statusValue = application
      ? pill(`Applied · ${application.status}`, "mint")
      : opp.status === "closed"
        ? pill("Closed", "error")
        : pill(note.text, note.urgent ? "warning" : "");

    const body = el("div", { className: "ch-stack" }, [
      el("div", { className: "ch-detail-grid" }, [
        detailTile("Organization", opp.organization),
        detailTile("Type", opp.type),
        detailTile("Deadline", formatDate(opp.deadline)),
        detailTile("Status", statusValue)
      ]),
      el("section", { className: "ch-stack-sm" }, [
        blockTitle("About this opportunity"),
        el("p", { className: "ch-text", text: opp.description || "No description provided." })
      ]),
      el("section", { className: "ch-stack-sm" }, [
        blockTitle("Required Skills"),
        el("ul", { className: "comparison-list" }, buildComparisonItems(opp.requiredSkills, result))
      ]),
      el("section", { className: "ch-stack-sm" }, [
        blockTitle("Your Match Score"),
        el("div", {
          className: "match-score-container",
          style: { "--match": String(result.percentage), "--match-color": matchColor(result.percentage) }
        }, el("p", { className: "match-score", text: `Match: ${result.percentage}%` })),
        el("p", { className: "ch-formula-line" }, buildMatchFormula(result)),
        result.missing.length
          ? el("p", { className: "ch-hint", text: `Tip: add ${listToSentence(result.missing)} to your profile to reach 100%.` })
          : null
      ])
    ]);

    const compareButton = button("Compare in Skill Matching", "btn-ghost", () => {
      state.ui.matchingOpportunityId = opp.id;
      saveState();
      renderMatching();
      closeModal({ restoreFocus: false });
      dom.matching.section?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    });

    const applyButton = button(apply.text, apply.className.replace(/^btn /, ""), () => {
      if (applyToOpportunity(opp.id)) closeModal({ restoreFocus: false });
    }, { title: apply.title, "aria-disabled": apply.disabled ? "true" : null });

    openModal({
      title: opp.title,
      subtitle: `${opp.organization} · ${opp.type}`,
      body,
      footer: [compareButton, applyButton]
    });
  }

  /* ----- 9b. Apply system ----- */
  function applyToOpportunity(opportunityId) {
    const opp = findOpportunity(opportunityId);

    // 1. Validate
    if (!opp) {
      showToast("Sorry, that opportunity could not be found.", "error");
      return false;
    }
    if (findApplicationFor(opportunityId)) {
      showToast("Already applied to this opportunity.", "warning");
      return false;
    }
    if (isDeadlinePassed(opp.deadline)) {
      showToast("This opportunity is no longer accepting applications.", "error");
      return false;
    }

    // 2. Update state
    const application = {
      id: createId("app"),
      opportunityId,
      title: opp.title,
      organization: opp.organization,
      appliedDate: todayISO(),
      updatedDate: todayISO(),
      status: "Applied"
    };
    state.applications.unshift(application);
    opp.status = "applied";
    addNotification(`Application submitted successfully for ${opp.title}.`, "success", "#applications");
    saveState();

    // 3. Update only the affected parts of the page
    updateOpportunityCard(opportunityId);
    renderTracker({ flashId: application.id });
    updateDashboardStats();
    showToast(`Applied to ${opp.title}! It's now in your Application Tracker.`, "success", {
      actionLabel: "View tracker",
      onAction: () => scrollToSection("applications")
    });
    return true;
  }

  /* ----- 9c. Application status ----- */
  function openStatusModal(applicationId) {
    const application = state.applications.find(app => app.id === applicationId);
    if (!application) {
      showToast("That application could not be found.", "error");
      return;
    }

    let selected = application.status;
    const optionLabels = APPLICATION_STATUSES.map(status => {
      const input = el("input", {
        attrs: { type: "radio", name: "ch-application-status", value: status },
        props: { checked: status === selected }
      });
      const option = el("label", {
        className: `ch-status-option${status === selected ? " is-selected" : ""}`,
        style: { "--accent-rgb": STATUS_META[status].rgb }
      }, [
        input,
        el("span", {}, [el("strong", { text: status }), el("small", { text: STATUS_META[status].description })])
      ]);
      input.addEventListener("change", () => {
        selected = status;
        optionLabels.forEach(label => label.classList.toggle("is-selected", label === option));
      });
      return option;
    });

    const body = el("div", { className: "ch-stack" }, [
      el("div", { className: "ch-detail-grid" }, [
        detailTile("Organization", application.organization),
        detailTile("Applied On", formatDate(application.appliedDate)),
        detailTile("Last Updated", formatDate(application.updatedDate))
      ]),
      el("section", { className: "ch-stack-sm" }, [
        blockTitle("Choose the new status"),
        el("div", { className: "ch-status-options", attrs: { role: "radiogroup", "aria-label": "Application status" } }, optionLabels)
      ])
    ]);

    openModal({
      title: "Update Application Status",
      subtitle: application.title,
      body,
      initialFocus: optionLabels[APPLICATION_STATUSES.indexOf(selected)]?.querySelector("input"),
      footer: [
        button("Cancel", "btn-secondary", () => closeModal()),
        button("Update Status", "btn-primary", () => {
          closeModal({ restoreFocus: false });
          updateApplicationStatus(application.id, selected);
        })
      ]
    });
  }

  function updateApplicationStatus(applicationId, status) {
    const application = state.applications.find(app => app.id === applicationId);
    if (!application || !APPLICATION_STATUSES.includes(status)) {
      showToast("Could not update that application.", "error");
      return;
    }
    if (application.status === status) {
      showToast(`Status is already ${status}.`, "info");
      return;
    }

    application.status = status;
    application.updatedDate = todayISO();
    addNotification(STATUS_META[status].notify(application.title), status === "Rejected" ? "warning" : "success", "#applications");
    saveState();

    renderTracker({ flashId: application.id });
    dom.trackerList?.querySelector(`[data-id="${CSS.escape(application.id)}"] .ch-status-trigger`)?.focus({ preventScroll: true });
    showToast(`Application status updated to ${status}.`, "success");
  }

  /* ----- 9d. Edit Profile ----- */
  const pickProfileData = source => ({
    profile: {
      name: source.profile.name,
      course: source.profile.course,
      semester: source.profile.semester,
      github: source.profile.github,
      linkedin: source.profile.linkedin
    },
    skills: source.skills.map(({ name, proficiency, category }) => ({ name, proficiency, category })),
    projects: [...source.projects],
    achievements: [...source.achievements],
    certifications: [...source.certifications]
  });

  function openProfileModal() {
    const { profile } = state;
    const skillDraft = state.skills.map(skill => ({ ...skill, key: createId("skill"), autoCategory: false, nameInput: null }));
    const alertBox = el("div", { className: "ch-alert", attrs: { role: "alert", hidden: true } });
    const completionNote = el("p", { className: "ch-footer-note" });
    const currentCompletion = calculateProfileCompletion().percentage;

    const textarea = (items, placeholder) =>
      el("textarea", { className: "ch-input", attrs: { rows: 4, placeholder }, props: { value: items.join("\n") } });

    const inputs = {
      name: el("input", { className: "ch-input", attrs: { type: "text", maxlength: 50, autocomplete: "name", placeholder: "Your full name" }, props: { value: profile.name } }),
      course: el("input", { className: "ch-input", attrs: { type: "text", maxlength: 80, placeholder: "e.g. Computer Science & Engineering" }, props: { value: profile.course } }),
      semester: buildSelect([["", "Not specified"], ...Array.from({ length: 8 }, (_, i) => [String(i + 1), `Semester ${i + 1}`])], profile.semester),
      projects: textarea(state.projects, "One project per line"),
      achievements: textarea(state.achievements, "One achievement per line"),
      certifications: textarea(state.certifications, "One certification per line"),
      github: el("input", { className: "ch-input", attrs: { type: "url", inputmode: "url", placeholder: "https://github.com/username" }, props: { value: profile.github } }),
      linkedin: el("input", { className: "ch-input", attrs: { type: "url", inputmode: "url", placeholder: "https://linkedin.com/in/username" }, props: { value: profile.linkedin } })
    };

    // Reads the form into the same shape as the state.
    const collect = () => ({
      profile: {
        name: inputs.name.value.trim(),
        course: inputs.course.value.trim(),
        semester: inputs.semester.value ? Number(inputs.semester.value) : "",
        github: inputs.github.value.trim(),
        linkedin: inputs.linkedin.value.trim()
      },
      skills: skillDraft
        .filter(skill => skill.name.trim())
        .map(({ name, proficiency, category }) => ({
          name: name.trim(),
          proficiency: clamp(Math.round(Number(proficiency) || 0), 0, 100),
          category: SKILL_CATEGORIES.includes(category) ? category : "Other"
        })),
      projects: splitLines(inputs.projects.value),
      achievements: splitLines(inputs.achievements.value),
      certifications: splitLines(inputs.certifications.value)
    });

    const updateCompletionNote = () => {
      const next = calculateProfileCompletion(collect()).percentage;
      completionNote.replaceChildren(
        "Profile completion: ",
        el("strong", { text: `${next}%` }),
        next !== currentCompletion ? ` (now ${currentCompletion}%)` : ""
      );
    };

    /* Skill rows: name · category · proficiency slider · remove */
    const skillList = el("div", { className: "ch-row-list" });
    const addSkillButton = button("+ Add Skill", "btn-secondary ch-btn-sm", () => {
      if (skillDraft.length >= MAX_SKILLS) {
        showToast(`You can add up to ${MAX_SKILLS} skills.`, "warning");
        return;
      }
      const skill = { name: "", proficiency: 60, category: "Other", key: createId("skill"), autoCategory: true, nameInput: null };
      skillDraft.push(skill);
      renderSkillRows();
      skill.nameInput?.focus();
      updateCompletionNote();
    });

    function buildSkillRow(skill) {
      const nameInput = el("input", {
        className: "ch-input ch-skill-name",
        attrs: { type: "text", maxlength: 30, placeholder: "Skill name (e.g. Git)", "aria-label": "Skill name" },
        props: { value: skill.name }
      });
      const categorySelect = buildSelect(SKILL_CATEGORIES.map(category => [category, category]), skill.category, "ch-input ch-skill-cat", { "aria-label": "Skill category" });
      const range = el("input", {
        className: "ch-range",
        attrs: { type: "range", min: 0, max: 100, step: 5, "aria-label": "Proficiency" },
        props: { value: String(skill.proficiency) }
      });
      const output = el("output", { className: "ch-range-value", text: `${skill.proficiency}%` });
      const removeButton = el("button", {
        className: "icon-btn ch-icon-sm",
        attrs: { type: "button", "aria-label": "Remove skill", title: "Remove skill" },
        text: "✕"
      });

      nameInput.addEventListener("input", () => {
        skill.name = nameInput.value;
        if (skill.autoCategory) {
          skill.category = guessCategory(skill.name);
          categorySelect.value = skill.category;
        }
      });
      categorySelect.addEventListener("change", () => {
        skill.category = categorySelect.value;
        skill.autoCategory = false;
      });
      range.addEventListener("input", () => {
        skill.proficiency = Number(range.value);
        output.textContent = `${range.value}%`;
      });
      removeButton.addEventListener("click", () => {
        skillDraft.splice(skillDraft.indexOf(skill), 1);
        renderSkillRows();
        addSkillButton.focus();
        updateCompletionNote();
      });

      skill.nameInput = nameInput;
      return el("div", { className: "ch-row-card ch-skill-row" }, [
        nameInput,
        categorySelect,
        el("div", { className: "ch-range-wrap" }, [range, output]),
        removeButton
      ]);
    }

    function renderSkillRows() {
      skillList.replaceChildren(...(skillDraft.length
        ? skillDraft.map(buildSkillRow)
        : [el("p", { className: "ch-hint", text: "No skills yet. Add your first skill." })]));
    }

    const form = el("form", { className: "ch-stack", attrs: { id: "ch-profile-form", novalidate: true } }, [
      alertBox,
      el("section", { className: "ch-stack-sm" }, [
        blockTitle("Basic Information"),
        el("div", { className: "ch-form-grid" }, [field("Name", inputs.name), field("Course", inputs.course), field("Semester", inputs.semester)])
      ]),
      el("section", { className: "ch-stack-sm" }, [
        blockTitle("Skills"),
        el("p", { className: "ch-hint", text: "Your skills power opportunity matching and your Group Up role. Use the slider to set proficiency." }),
        skillList,
        addSkillButton
      ]),
      el("section", { className: "ch-stack-sm" }, [
        blockTitle("Projects, Achievements & Certifications"),
        el("div", { className: "ch-form-grid" }, [
          field("Projects", inputs.projects, "One per line"),
          field("Achievements", inputs.achievements, "One per line"),
          field("Certifications", inputs.certifications, "One per line")
        ])
      ]),
      el("section", { className: "ch-stack-sm" }, [
        blockTitle("Professional Links"),
        el("div", { className: "ch-form-grid" }, [field("GitHub", inputs.github), field("LinkedIn", inputs.linkedin)])
      ])
    ]);

    form.addEventListener("input", event => {
      clearFieldError(event);
      updateCompletionNote();
    });
    form.addEventListener("change", updateCompletionNote);
    form.addEventListener("submit", event => {
      event.preventDefault();
      clearFormErrors(form, alertBox);
      const data = collect();
      const errors = validateProfile(data, inputs, skillDraft);
      if (errors.length) {
        showFormErrors(errors, alertBox);
        return;
      }
      data.profile.github = normalizeUrl(data.profile.github);
      data.profile.linkedin = normalizeUrl(data.profile.linkedin);
      saveProfile(data);
    });

    renderSkillRows();
    updateCompletionNote();

    openModal({
      title: "Edit Profile",
      subtitle: "Changes update your dashboard, matches and team analysis instantly.",
      body: form,
      size: "lg",
      initialFocus: inputs.name,
      footer: [
        completionNote,
        button("Cancel", "btn-secondary", () => closeModal()),
        el("button", { className: "btn btn-primary", attrs: { type: "submit", form: "ch-profile-form" }, text: "Save Changes" })
      ]
    });
  }

  function validateProfile(data, inputs, skillDraft) {
    const errors = [];
    const { name, course } = data.profile;

    if (name.length < 2) errors.push({ input: inputs.name, message: "Please enter your name (at least 2 characters)." });
    if (course.length < 2) errors.push({ input: inputs.course, message: "Please enter your course." });

    const seen = new Set();
    skillDraft.forEach(skill => {
      const label = skill.name.trim();
      if (!label) return;
      const key = normalizeSkill(label);
      if (seen.has(key)) errors.push({ input: skill.nameInput, message: `"${label}" is listed more than once.` });
      seen.add(key);
    });
    if (data.skills.length > MAX_SKILLS) errors.push({ input: null, message: `You can add up to ${MAX_SKILLS} skills.` });

    [["projects", "project"], ["achievements", "achievement"], ["certifications", "certification"]].forEach(([key, word]) => {
      if (data[key].length > MAX_LIST_ITEMS) errors.push({ input: inputs[key], message: `Please keep it to ${MAX_LIST_ITEMS} ${word}s or fewer.` });
      if (data[key].some(item => item.length > 100)) errors.push({ input: inputs[key], message: `Each ${word} should be under 100 characters.` });
    });

    [["github", "GitHub", "github.com"], ["linkedin", "LinkedIn", "linkedin.com"]].forEach(([key, label, domain]) => {
      const value = data.profile[key];
      if (!value) return;
      const url = normalizeUrl(value);
      if (!url) {
        errors.push({ input: inputs[key], message: `Enter a valid ${label} URL, e.g. https://${domain}/username.` });
      } else if (!new URL(url).hostname.toLowerCase().endsWith(domain)) {
        errors.push({ input: inputs[key], message: `That doesn't look like a ${label} link (${domain}).` });
      }
    });

    return errors;
  }

  function saveProfile(data) {
    if (JSON.stringify(pickProfileData(state)) === JSON.stringify(data)) {
      closeModal();
      showToast("No changes to save.", "info");
      return;
    }

    const previousScores = new Map(state.opportunities.map(({ id, matchScore }) => [id, matchScore]));

    // 1. Update state
    Object.assign(state.profile, data.profile);
    state.skills = data.skills;
    state.projects = data.projects;
    state.achievements = data.achievements;
    state.certifications = data.certifications;

    // 2. Recalculate every match score
    refreshOpportunityData();

    // 3. Notifications
    addNotification("Your profile was updated.", "info", "#profile");
    const improved = state.opportunities.filter(opp => !isDeadlinePassed(opp.deadline) && opp.matchScore > (previousScores.get(opp.id) ?? 0));
    improved.slice(0, 3).forEach(opp => {
      const before = previousScores.get(opp.id) ?? 0;
      const message = opp.status === "available" && opp.matchScore >= STRONG_MATCH && before < STRONG_MATCH
        ? `New opportunity matches your skills: ${opp.title} (${opp.matchScore}% match).`
        : `Your match for ${opp.title} improved from ${before}% to ${opp.matchScore}%.`;
      addNotification(message, "success", "#opportunities");
    });

    // 4. Save + re-render everything that depends on the profile
    saveState();
    closeModal();
    renderAll();

    const { percentage } = calculateProfileCompletion();
    const extra = improved.length ? ` · ${pluralize(improved.length, "match", "matches")} improved` : "";
    showToast(`Profile updated · ${percentage}% complete${extra}.`, "success");
  }

  /* ----- 9e. Full profile view ----- */
  function openFullProfileModal() {
    const { profile } = state;
    const completion = calculateProfileCompletion();
    const team = state.group ? analyseTeam(state.group) : null;

    const linkValue = url => (url
      ? el("a", { className: "ch-ext-link", attrs: { href: url, target: "_blank", rel: "noopener noreferrer" }, text: url.replace(/^https?:\/\//, "").replace(/\/$/, "") })
      : "Not added");

    const listTile = (label, items) => el("div", { className: "ch-detail" }, [
      el("span", { className: "ch-detail-label", text: label }),
      items.length
        ? el("ul", { className: "bullet-list ch-detail-list" }, items.map(text => el("li", { text })))
        : el("p", { className: "ch-hint", text: "Nothing added yet" })
    ]);

    const sortedSkills = [...state.skills].sort((a, b) => b.proficiency - a.proficiency);

    const body = el("div", { className: "ch-stack" }, [
      el("section", { className: "ch-stack-sm" }, [
        blockTitle(`Profile Completion: ${completion.percentage}%`),
        el("progress", {
          className: "skill-progress",
          attrs: { max: 100, "aria-label": `Profile completion ${completion.percentage}%` },
          props: { value: completion.percentage }
        }),
        el("ul", { className: "comparison-list" }, completion.sections.map(({ label, points, done }) =>
          el("li", { className: done ? "match-success" : "match-fail" }, [
            el("span", { attrs: { "aria-hidden": "true" }, text: done ? "✓" : "✗" }),
            ` ${label} · ${points} pts`
          ]))),
        el("p", { className: "ch-formula-line" }, [
          "Completion = points earned ÷ total points × 100 = ",
          el("strong", { text: `${completion.earned} ÷ ${completion.total} × 100 = ${completion.percentage}%` })
        ])
      ]),
      el("section", { className: "ch-stack-sm" }, [
        blockTitle(`Skills (${state.skills.length})`),
        sortedSkills.length
          ? el("div", { className: "ch-skill-grid" }, sortedSkills.map(buildSkillCard))
          : el("p", { className: "ch-hint", text: "No skills added yet." })
      ]),
      el("div", { className: "ch-detail-grid" }, [
        listTile("Projects", state.projects),
        listTile("Achievements", state.achievements),
        listTile("Certifications", state.certifications)
      ]),
      el("div", { className: "ch-detail-grid" }, [
        detailTile("GitHub", linkValue(profile.github)),
        detailTile("LinkedIn", linkValue(profile.linkedin)),
        detailTile("Applications", pluralize(state.applications.length, "application")),
        detailTile("Team", team ? `${state.group.name} · ${pluralize(team.members.length, "member")}` : "No team yet")
      ])
    ]);

    openModal({
      title: profile.name || "Student Profile",
      subtitle: [profile.course, profile.semester ? `Semester ${profile.semester}` : ""].filter(Boolean).join(" · "),
      body,
      size: "lg",
      footer: [
        button("Close", "btn-secondary", () => closeModal()),
        button("Edit Profile", "btn-primary", () => openProfileModal())
      ]
    });
  }

  /* ----- 9f. Group Up: create / edit a group ----- */
  function openGroupModal(mode = "create") {
    const isEdit = mode === "edit" && Boolean(state.group);

    const toDraft = (member = {}) => ({
      id: member.id ?? createId("mem"),
      name: member.name ?? "",
      role: member.role ?? "",
      skillsText: (member.skills ?? []).join(", "),
      isSelf: Boolean(member.isSelf),
      inputs: {}
    });

    const draftMembers = isEdit
      ? state.group.members.map(toDraft)
      : [toDraft({ isSelf: true, name: state.profile.name }), toDraft()];

    const alertBox = el("div", { className: "ch-alert", attrs: { role: "alert", hidden: true } });
    const nameInput = el("input", {
      className: "ch-input",
      attrs: { type: "text", maxlength: 40, placeholder: "e.g. Code Crusaders", autocomplete: "off" },
      props: { value: isEdit ? state.group.name : "" }
    });
    const membersTitle = blockTitle("");
    const memberList = el("div", { className: "ch-row-list" });
    const liveNote = el("p", { className: "ch-footer-note" });

    const selfName = () => state.profile.name || "You";
    const resolveSkills = member => (member.isSelf ? getSkillNames() : parseSkillList(member.skillsText));
    const activeMembers = () => draftMembers.filter(member => member.isSelf || member.name.trim() || member.skillsText.trim());
    const toGroupMember = member => ({
      id: member.id,
      name: member.isSelf ? selfName() : member.name.trim(),
      role: member.role,
      skills: member.isSelf ? [] : parseSkillList(member.skillsText),
      isSelf: member.isSelf
    });

    const addMemberButton = button("+ Add Member", "btn-secondary ch-btn-sm", () => {
      if (draftMembers.length >= MAX_GROUP_SIZE) {
        showToast(`A group can have at most ${MAX_GROUP_SIZE} members.`, "warning");
        return;
      }
      const member = toDraft();
      draftMembers.push(member);
      renderMemberRows();
      updateLivePreview();
      member.inputs.name?.focus();
    });

    function updateLivePreview() {
      const members = activeMembers().map(toGroupMember);
      const analysis = analyseTeam({ name: nameInput.value, members });
      liveNote.replaceChildren(
        "Live analysis: ",
        el("strong", { text: pluralize(members.length, "member") }),
        " · ",
        el("strong", { text: `${analysis.coverage}%` }),
        " coverage · ",
        el("strong", { text: `${analysis.readiness}%` }),
        " readiness"
      );
      membersTitle.textContent = `Members (${draftMembers.length}/${MAX_GROUP_SIZE})`;
      addMemberButton.textContent = draftMembers.length >= MAX_GROUP_SIZE
        ? `Group is full (${MAX_GROUP_SIZE}/${MAX_GROUP_SIZE})`
        : "+ Add Member";
    }

    function buildMemberRow(member, index) {
      const number = index + 1;
      const memberName = el("input", {
        className: "ch-input",
        attrs: { type: "text", maxlength: 30, placeholder: "e.g. Priya", "aria-label": `Member ${number} name` },
        props: { value: member.isSelf ? selfName() : member.name, readOnly: member.isSelf }
      });
      const memberRole = buildSelect(
        [["", "Auto-detect from skills"], ...TEAM_AREAS.map(({ area, role }) => [area, role])],
        member.role,
        "ch-input",
        { "aria-label": `Member ${number} role` }
      );
      const memberSkills = el("input", {
        className: "ch-input",
        attrs: { type: "text", maxlength: 200, placeholder: "Comma separated, e.g. Selenium, Jest", "aria-label": `Member ${number} skills` },
        props: { value: member.isSelf ? getSkillNames().join(", ") : member.skillsText, readOnly: member.isSelf }
      });
      const suggestion = el("p", { className: "ch-hint" });
      const removeButton = el("button", {
        className: "icon-btn ch-icon-sm",
        attrs: {
          type: "button",
          title: member.isSelf ? "You are the group creator" : "Remove member",
          "aria-label": member.isSelf ? "You cannot remove yourself" : `Remove member ${number}`
        },
        props: { disabled: member.isSelf },
        text: "✕"
      });

      const refreshSuggestion = () => {
        const skills = resolveSkills(member);
        const role = roleLabel(recommendRole(skills));
        if (member.isSelf) suggestion.textContent = `Synced from your profile · Suggested role: ${role}`;
        else suggestion.textContent = skills.length ? `Suggested role: ${role}` : "Add skills to get a role suggestion.";
      };

      memberName.addEventListener("input", () => {
        member.name = memberName.value;
        updateLivePreview();
      });
      memberRole.addEventListener("change", () => {
        member.role = memberRole.value;
        updateLivePreview();
      });
      memberSkills.addEventListener("input", () => {
        member.skillsText = memberSkills.value;
        refreshSuggestion();
        updateLivePreview();
      });
      removeButton.addEventListener("click", () => {
        draftMembers.splice(draftMembers.indexOf(member), 1);
        renderMemberRows();
        updateLivePreview();
        addMemberButton.focus();
      });

      member.inputs = { name: memberName, skills: memberSkills };
      refreshSuggestion();

      return el("div", { className: "ch-row-card" }, [
        el("div", { className: "ch-row-head" }, [
          el("span", { className: "ch-row-title", text: `Member ${number}` }),
          member.isSelf ? pill("You", "mint") : null,
          removeButton
        ]),
        el("div", { className: "ch-form-grid" }, [field("Name", memberName), field("Role", memberRole)]),
        field("Skills", memberSkills),
        suggestion
      ]);
    }

    function renderMemberRows() {
      memberList.replaceChildren(...draftMembers.map(buildMemberRow));
    }

    const form = el("form", { className: "ch-stack", attrs: { id: "ch-group-form", novalidate: true } }, [
      alertBox,
      el("section", { className: "ch-stack-sm" }, [
        field("Group Name", nameInput, isEdit ? "" : "Creating a new group replaces your current team in this prototype.")
      ]),
      el("section", { className: "ch-stack-sm" }, [
        membersTitle,
        el("p", { className: "ch-hint", text: `Invite 2 to ${MAX_GROUP_SIZE} people. Leave Role on auto-detect and CampusHub will suggest one from each member's skills.` }),
        memberList,
        addMemberButton
      ])
    ]);

    form.addEventListener("input", clearFieldError);
    form.addEventListener("submit", event => {
      event.preventDefault();
      clearFormErrors(form, alertBox);

      const errors = [];
      const groupName = nameInput.value.trim();
      if (groupName.length < 2) errors.push({ input: nameInput, message: "Give your group a name (at least 2 characters)." });

      const members = activeMembers();
      const seenNames = new Set();
      members.forEach(member => {
        if (member.isSelf) {
          seenNames.add(selfName().toLowerCase());
          return;
        }
        const label = member.name.trim() || `Member ${draftMembers.indexOf(member) + 1}`;
        const key = member.name.trim().toLowerCase();
        if (!key) errors.push({ input: member.inputs.name, message: `${label}: please enter a name.` });
        else if (seenNames.has(key)) errors.push({ input: member.inputs.name, message: `"${member.name.trim()}" is already in the group.` });
        seenNames.add(key);
        if (!parseSkillList(member.skillsText).length) errors.push({ input: member.inputs.skills, message: `${label}: add at least one skill.` });
      });

      if (members.length < MIN_GROUP_SIZE) errors.push({ input: null, message: `A group needs at least ${MIN_GROUP_SIZE} members. Add a teammate.` });
      if (members.length > MAX_GROUP_SIZE) errors.push({ input: null, message: `A group can have at most ${MAX_GROUP_SIZE} members.` });

      if (errors.length) {
        showFormErrors(errors, alertBox);
        return;
      }
      saveGroup({ name: groupName, members: members.map(toGroupMember) }, isEdit);
    });

    nameInput.addEventListener("input", updateLivePreview);
    renderMemberRows();
    updateLivePreview();

    openModal({
      title: isEdit ? "Edit Group" : "Create a Group",
      subtitle: "Combine your friends' skills and see how ready your team is.",
      body: form,
      size: "lg",
      initialFocus: nameInput,
      footer: [
        liveNote,
        button("Cancel", "btn-secondary", () => closeModal()),
        el("button", { className: "btn btn-primary", attrs: { type: "submit", form: "ch-group-form" }, text: isEdit ? "Save Changes" : "Create Group" })
      ]
    });
  }

  function saveGroup(groupData, isEdit) {
    const now = new Date().toISOString();
    state.group = {
      name: groupData.name,
      members: groupData.members,
      createdAt: isEdit ? (state.group?.createdAt ?? now) : now,
      updatedAt: now
    };

    const analysis = analyseTeam(state.group);
    addNotification(`Your team ${state.group.name} has ${analysis.coverage}% skill coverage and ${analysis.readiness}% readiness.`, "info", "#group-up");
    saveState();
    closeModal();
    renderTeam({ highlight: true });
    showToast(`${isEdit ? "Group updated" : "Group created"}: ${state.group.name} · ${analysis.coverage}% coverage · ${analysis.readiness}% ready.`, "success");
  }

  /* ----- 9g. Click router (event delegation for the whole page) ----- */
  const ACTIONS = {
    "view-opportunity": target => openOpportunityModal(target.closest("[data-id]")?.dataset.id),
    "apply": target => applyToOpportunity(target.closest("[data-id]")?.dataset.id),
    "update-status": target => openStatusModal(target.closest("[data-id]")?.dataset.id),
    "edit-profile": () => openProfileModal(),
    "view-full-profile": () => openFullProfileModal(),
    "create-group": () => openGroupModal("create"),
    "edit-group": () => openGroupModal("edit"),
    "go-to": target => scrollToSection(target.dataset.target)
  };

  function bindStaticButtons() {
    const bind = (node, action) => {
      if (!node) return;
      node.dataset.action = action;
      if (node.tagName === "BUTTON") node.type = "button";
    };
    bind(dom.profile.editBtn, "edit-profile");
    bind(dom.profile.fullBtn, "view-full-profile");
    bind(dom.team.createBtn, "create-group");
  }

  function handleDocumentClick(event) {
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) {
      const handler = ACTIONS[actionTarget.dataset.action];
      if (handler) {
        event.preventDefault();
        safely(`action "${actionTarget.dataset.action}"`, () => handler(actionTarget, event));
      }
      return;
    }

    const link = event.target.closest("a[href]");
    if (link) handleLinkClick(link, event);
  }

  function handleGlobalKeydown(event) {
    if (event.key !== "Escape") return;
    if (modalState.backdrop) {
      event.preventDefault();
      closeModal();
    } else if (notifUi.open) {
      closeNotificationPanel();
      dom.notifBtn?.focus();
    }
  }

  /* ========================================================================
     10. NAVIGATION
     ======================================================================== */
  let activeNavId = "";

  function setActiveNav(id) {
    if (!id || id === activeNavId) return;
    activeNavId = id;

    let activeLink = null;
    dom.navLinks.forEach(link => {
      const isActive = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "location");
        activeLink = link;
      } else {
        link.removeAttribute("aria-current");
      }
    });

    // On tablet/mobile the navbar scrolls sideways: keep the active link visible.
    const nav = dom.navbar;
    if (activeLink && nav && nav.scrollWidth > nav.clientWidth) {
      const linkBox = activeLink.getBoundingClientRect();
      const navBox = nav.getBoundingClientRect();
      if (linkBox.left < navBox.left || linkBox.right > navBox.right) {
        nav.scrollBy({ left: linkBox.left - navBox.left - 16, behavior: scrollBehavior() });
      }
    }
  }

  function scrollToSection(id) {
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    target.scrollIntoView({ behavior: scrollBehavior(), block: "start" }); // respects CSS scroll-margin-top
    try {
      history.replaceState(null, "", `#${id}`);
    } catch {
      /* history API unavailable */
    }
    if (NAV_IDS.includes(id)) setActiveNav(id);
  }

  function handleLinkClick(link, event) {
    // Logo → back to top (href="/" would leave the page when opened from a file)
    if (link.closest(".brand")) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
      try {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      } catch {
        /* history API unavailable */
      }
      setActiveNav("dashboard");
      return;
    }

    const href = link.getAttribute("href") ?? "";
    if (!href.startsWith("#")) return; // real external links behave normally
    event.preventDefault();

    const label = link.textContent.trim() || "This";
    if (href === "#") {
      showToast(`The ${label} link isn't available in this prototype.`, "info");
      return;
    }

    let id = href.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      /* keep the raw id */
    }

    if (!document.getElementById(id)) {
      showToast(`The ${label} page isn't part of this CampusHub prototype.`, "info");
      return;
    }
    scrollToSection(id);
  }

  // Highlights the navbar link of the section currently in the middle of the screen.
  function initNavigation() {
    const initialId = NAV_IDS.includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : "dashboard";
    setActiveNav(initialId);

    if (!("IntersectionObserver" in window)) return;

    const sectionMap = new Map();
    NAV_SECTION_SELECTORS.forEach(([selector, navId]) => {
      const node = document.querySelector(selector);
      if (node) sectionMap.set(node, navId);
    });

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) setActiveNav(sectionMap.get(entry.target));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });

    sectionMap.forEach((_, node) => observer.observe(node));
  }

  /* ========================================================================
     11. INIT + RESET
     ======================================================================== */
  function resetDemoData() {
    closeModal({ immediate: true, restoreFocus: false });
    closeNotificationPanel();
    storage.remove(STORAGE_KEY);
    replaceState(createDemoState());
    refreshOpportunityData();
    saveState();
    renderAll();
    showToast("CampusHub demo data has been restored.", "info");
    return "CampusHub has been reset to the original demo data.";
  }

  // Console helpers for the demo / viva
  window.resetCampusHub = resetDemoData;
  window.CampusHub = Object.freeze({
    getState: () => JSON.parse(JSON.stringify(state)),
    reset: resetDemoData
  });

  function init() {
    safely("hero animation", initHeroAnimation);
    safely("component styles", injectComponentStyles);
    safely("element cache", cacheDom);

    replaceState(loadState());
    safely("opportunity data", refreshOpportunityData);

    safely("image fallbacks", initImageFallbacks);
    safely("buttons", bindStaticButtons);
    safely("notifications", initNotifications);
    safely("skill matching", initMatchingUi);
    safely("group up", initTeamUi);
    safely("section info", initSectionMeta);

    renderAll();

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleGlobalKeydown);
    safely("navigation", initNavigation);

    if (loadNotice) showToast(loadNotice, "warning", { duration: 6000 });
    console.info("%cCampusHub ready", "color:#d4af37;font-weight:700", "· Run resetCampusHub() to restore the demo data.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
