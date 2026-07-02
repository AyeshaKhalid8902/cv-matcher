import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱  Seeding database…");

  // ── Clear existing opportunity data ──────────────────────────────────────────
  await prisma.aIMatchResult.deleteMany();
  await prisma.jobOpportunity.deleteMany();
  await prisma.scholarshipOpportunity.deleteMany();

  // ── Jobs ─────────────────────────────────────────────────────────────────────
  const jobs = await prisma.jobOpportunity.createMany({
    data: [
      // Software / Tech
      {
        title: "Senior Software Engineer",
        company: "Tech Corp",
        location: "Remote",
        country: "USA",
        description: "Build and scale distributed web applications using modern JavaScript frameworks.",
        requirements: ["5+ years experience", "JavaScript", "System Design"],
        tags: ["Software Engineering", "React", "Node.js", "TypeScript", "AWS"],
        salaryRange: "$140,000 – $180,000/year",
        isRemote: true,
      },
      {
        title: "Full Stack Developer",
        company: "StartupHub",
        location: "London",
        country: "UK",
        description: "Own features end-to-end from database schema to pixel-perfect UI.",
        requirements: ["3+ years experience", "TypeScript", "PostgreSQL"],
        tags: ["Software Engineering", "Next.js", "TypeScript", "PostgreSQL", "React"],
        salaryRange: "£70,000 – £95,000/year",
        isRemote: true,
      },
      {
        title: "DevOps Engineer",
        company: "Cloud Systems",
        location: "Singapore",
        country: "Singapore",
        description: "Design and maintain CI/CD pipelines and cloud infrastructure at scale.",
        requirements: ["3+ years experience", "Docker", "Kubernetes"],
        tags: ["Software Engineering", "DevOps", "AWS", "Docker", "Kubernetes", "CI/CD"],
        salaryRange: "$100,000 – $140,000/year",
        isRemote: false,
      },
      // Data Science
      {
        title: "Senior Data Scientist",
        company: "Analytics Pro",
        location: "New York",
        country: "USA",
        description: "Build predictive models and translate data insights into business decisions.",
        requirements: ["4+ years experience", "Python", "Machine Learning"],
        tags: ["Data Science", "Python", "Machine Learning", "SQL", "TensorFlow", "Statistics"],
        salaryRange: "$130,000 – $160,000/year",
        isRemote: true,
      },
      {
        title: "Data Analyst",
        company: "FinCorp",
        location: "Dubai",
        country: "UAE",
        description: "Analyze large datasets and create dashboards for executive decision-making.",
        requirements: ["2+ years experience", "SQL", "Excel"],
        tags: ["Data Science", "SQL", "Python", "Tableau", "Excel", "Power BI"],
        salaryRange: "AED 18,000 – 25,000/month",
        isRemote: false,
      },
      // Medicine / Healthcare
      {
        title: "Medical Officer",
        company: "Aga Khan University Hospital",
        location: "Karachi",
        country: "Pakistan",
        description: "Provide clinical care, diagnose patients, and oversee ward management.",
        requirements: ["MBBS", "1+ years experience", "Clinical Diagnosis"],
        tags: ["Medicine", "MBBS", "Clinical", "Patient Care", "Medical", "Healthcare"],
        salaryRange: "PKR 150,000 – 200,000/month",
        isRemote: false,
      },
      {
        title: "Specialist Physician",
        company: "Dubai Health Authority",
        location: "Dubai",
        country: "UAE",
        description: "Lead specialist consultations and manage complex medical cases in a tertiary facility.",
        requirements: ["MBBS", "Specialization", "5+ years experience"],
        tags: ["Medicine", "Healthcare", "Clinical", "Patient Care", "Physician"],
        salaryRange: "AED 25,000 – 45,000/month",
        isRemote: false,
      },
      {
        title: "Pharmacist",
        company: "HealthPlus Pharmacy",
        location: "Lahore",
        country: "Pakistan",
        description: "Dispense medications, counsel patients on drug interactions, and manage inventory.",
        requirements: ["Pharm-D", "1+ years experience"],
        tags: ["Pharmacy", "Pharmacology", "Drug Dispensing", "Patient Counseling", "Clinical"],
        salaryRange: "PKR 80,000 – 120,000/month",
        isRemote: false,
      },
      // Education
      {
        title: "University Lecturer",
        company: "FAST-NUCES",
        location: "Lahore",
        country: "Pakistan",
        description: "Teach undergraduate courses, conduct research, and mentor students.",
        requirements: ["Masters or PhD", "2+ years teaching experience"],
        tags: ["Education", "Teaching", "Research", "Lecturing", "Curriculum Design", "Academic"],
        salaryRange: "PKR 100,000 – 160,000/month",
        isRemote: false,
      },
      {
        title: "Online Curriculum Designer",
        company: "EduTech Global",
        location: "Remote",
        country: "UK",
        description: "Design and develop online learning modules and assessments for global learners.",
        requirements: ["Education background", "E-learning tools", "2+ years experience"],
        tags: ["Education", "Curriculum Design", "E-learning", "Teaching", "Instructional Design"],
        salaryRange: "£40,000 – £55,000/year",
        isRemote: true,
      },
      // Finance / Accounting
      {
        title: "Financial Analyst",
        company: "Global Investment Bank",
        location: "London",
        country: "UK",
        description: "Build financial models, conduct valuations, and prepare investment memorandums.",
        requirements: ["Finance degree", "3+ years experience", "Excel", "Financial Modeling"],
        tags: ["Finance", "Financial Modeling", "Excel", "Bloomberg", "Investment", "Accounting"],
        salaryRange: "£65,000 – £90,000/year",
        isRemote: false,
      },
      {
        title: "Chartered Accountant",
        company: "Deloitte Pakistan",
        location: "Karachi",
        country: "Pakistan",
        description: "Lead audit engagements, prepare financial statements, and advise on tax compliance.",
        requirements: ["CA or ACCA", "2+ years experience", "Audit"],
        tags: ["Accounting", "Audit", "Tax", "Finance", "CA", "ACCA", "Financial Reporting"],
        salaryRange: "PKR 120,000 – 200,000/month",
        isRemote: false,
      },
      // Marketing
      {
        title: "Digital Marketing Manager",
        company: "Brand Solutions",
        location: "Dubai",
        country: "UAE",
        description: "Own growth strategy across paid, SEO, and social channels to hit acquisition targets.",
        requirements: ["4+ years experience", "SEO", "Campaign Management"],
        tags: ["Marketing", "SEO", "Social Media", "Google Ads", "Analytics", "Content Strategy"],
        salaryRange: "AED 15,000 – 22,000/month",
        isRemote: false,
      },
      // HR
      {
        title: "HR Business Partner",
        company: "People First",
        location: "Remote",
        country: "Germany",
        description: "Partner with business leaders to drive talent strategy, DEI, and employee engagement.",
        requirements: ["3+ years HR experience", "HRIS", "Recruitment"],
        tags: ["Human Resources", "HR", "Recruitment", "Talent Management", "DEI", "HRIS"],
        salaryRange: "€55,000 – €70,000/year",
        isRemote: true,
      },
      // Law
      {
        title: "Legal Associate",
        company: "Orr Dignam & Co",
        location: "Karachi",
        country: "Pakistan",
        description: "Draft legal documents, advise corporate clients, and represent in commercial disputes.",
        requirements: ["LLB", "1+ years experience", "Contract Drafting"],
        tags: ["Law", "LLB", "Legal Research", "Contract Drafting", "Litigation", "Corporate Law"],
        salaryRange: "PKR 100,000 – 150,000/month",
        isRemote: false,
      },
      // Design
      {
        title: "Senior Product Designer",
        company: "Creative Studio",
        location: "Berlin",
        country: "Germany",
        description: "Lead end-to-end product design from wireframes to high-fidelity prototypes.",
        requirements: ["4+ years experience", "Figma", "User Research"],
        tags: ["Design", "UI", "UX", "Figma", "Prototyping", "User Research", "Product Design"],
        salaryRange: "€60,000 – €80,000/year",
        isRemote: true,
      },
      // Engineering
      {
        title: "Mechanical Engineer",
        company: "NESPAK",
        location: "Lahore",
        country: "Pakistan",
        description: "Design mechanical systems, review drawings, and manage site execution for infrastructure projects.",
        requirements: ["B.E. Mechanical", "2+ years experience", "AutoCAD"],
        tags: ["Engineering", "Mechanical", "AutoCAD", "CAD", "Thermodynamics", "Project Management"],
        salaryRange: "PKR 90,000 – 140,000/month",
        isRemote: false,
      },
      {
        title: "Civil Engineer",
        company: "DESCON",
        location: "Riyadh",
        country: "Saudi Arabia",
        description: "Oversee structural design and construction supervision for large-scale infrastructure.",
        requirements: ["B.E. Civil", "3+ years experience", "Structural Analysis"],
        tags: ["Engineering", "Civil", "Structural Analysis", "AutoCAD", "Construction", "Project Management"],
        salaryRange: "SAR 12,000 – 18,000/month",
        isRemote: false,
      },
      // Psychology
      {
        title: "Clinical Psychologist",
        company: "Mind Wellness Clinic",
        location: "Lahore",
        country: "Pakistan",
        description: "Conduct psychological assessments and deliver evidence-based therapy (CBT/DBT).",
        requirements: ["M.Phil or PhD Psychology", "2+ years experience"],
        tags: ["Psychology", "Counseling", "CBT", "Assessment", "Mental Health", "Therapy"],
        salaryRange: "PKR 80,000 – 120,000/month",
        isRemote: false,
      },
    ],
    skipDuplicates: true,
  });

  // ── Scholarships ──────────────────────────────────────────────────────────────
  const scholarships = await prisma.scholarshipOpportunity.createMany({
    data: [
      // Tech / CS
      {
        title: "AI & Machine Learning Masters Fellowship",
        university: "Stanford University",
        country: "USA",
        degreeLevel: "Masters",
        coverage: "Full",
        benefits: "Full tuition + $35,000 annual stipend + research funding",
        requirements: ["Computer Science background", "GPA 3.7+", "GRE required"],
        tags: ["Software Engineering", "AI", "Machine Learning", "Data Science", "Computer Science"],
      },
      {
        title: "AWS Cloud Computing Scholarship",
        university: "AWS Training & Certification",
        country: "Online",
        degreeLevel: "Certification",
        coverage: "Full",
        benefits: "Full certification costs covered + exam vouchers",
        requirements: ["Software Engineering background", "Basic cloud knowledge"],
        tags: ["Software Engineering", "Cloud Computing", "AWS", "DevOps", "Infrastructure"],
      },
      // Business / Finance
      {
        title: "Harvard Business School MBA Fellowship",
        university: "Harvard Business School",
        country: "USA",
        degreeLevel: "MBA",
        coverage: "Partial",
        benefits: "$150,000 total award over 2 years",
        requirements: ["Bachelor's degree", "3+ years work experience", "GMAT 700+"],
        tags: ["Business", "Management", "Finance", "MBA", "Strategy", "Leadership"],
      },
      {
        title: "ACCA Scholarship Programme",
        university: "ACCA Global",
        country: "UK",
        degreeLevel: "Professional Certification",
        coverage: "Full",
        benefits: "Full exam fees + study materials + mentorship",
        requirements: ["Finance or Accounting background", "Academic merit"],
        tags: ["Accounting", "Finance", "ACCA", "Audit", "Tax", "Financial Reporting"],
      },
      // Medicine / Healthcare
      {
        title: "MBBS Merit Scholarship",
        university: "Aga Khan University",
        country: "Pakistan",
        degreeLevel: "MBBS",
        coverage: "Full",
        benefits: "Full tuition + accommodation allowance",
        requirements: ["FSc Pre-Medical", "GPA 90%+", "Strong entrance test"],
        tags: ["Medicine", "MBBS", "Healthcare", "Clinical", "Medical"],
      },
      {
        title: "Johns Hopkins Global Public Health Masters",
        university: "Johns Hopkins Bloomberg School",
        country: "USA",
        degreeLevel: "Masters",
        coverage: "Partial",
        benefits: "$80,000 partial scholarship + research opportunities",
        requirements: ["Medical or Health background", "GRE/MCAT", "2+ years experience"],
        tags: ["Medicine", "Public Health", "Healthcare", "Epidemiology", "Global Health"],
      },
      {
        title: "Nursing Excellence Award",
        university: "King's College London",
        country: "UK",
        degreeLevel: "Masters",
        coverage: "Full",
        benefits: "£25,000/year full scholarship",
        requirements: ["Nursing background", "GPA 3.0+", "Clinical experience"],
        tags: ["Nursing", "Healthcare", "Patient Care", "Clinical", "Medical"],
      },
      {
        title: "Pharmacy Practice Scholarship",
        university: "University of Toronto",
        country: "Canada",
        degreeLevel: "Masters",
        coverage: "Full",
        benefits: "CAD 25,000/year + research funding",
        requirements: ["Pharm-D or equivalent", "GPA 3.3+"],
        tags: ["Pharmacy", "Pharmacology", "Clinical Pharmacy", "Drug Research", "Healthcare"],
      },
      // Education
      {
        title: "Fulbright Scholars — Education Leadership",
        university: "Fulbright Commission",
        country: "USA",
        degreeLevel: "Masters",
        coverage: "Full",
        benefits: "Full tuition + travel + living stipend",
        requirements: ["Teaching background", "2+ years experience", "Strong leadership potential"],
        tags: ["Education", "Teaching", "Curriculum Design", "Leadership", "Academic", "Research"],
      },
      {
        title: "Commonwealth Distance Learning Scholarship",
        university: "Commonwealth Scholarship Commission",
        country: "UK",
        degreeLevel: "Masters",
        coverage: "Full",
        benefits: "Full distance learning fees + digital resources",
        requirements: ["Any academic background", "Developing-country citizenship"],
        tags: ["Education", "E-learning", "Research", "Academic", "Development"],
      },
      // Data Science
      {
        title: "MIT Data Science PhD Fellowship",
        university: "MIT",
        country: "USA",
        degreeLevel: "PhD",
        coverage: "Full",
        benefits: "Full funding + $42,000 annual stipend + research budget",
        requirements: ["Masters in Statistics, CS, or related", "GPA 3.8+", "Publications preferred"],
        tags: ["Data Science", "Machine Learning", "Statistics", "AI", "Research", "PhD"],
      },
      // Finance
      {
        title: "LSE Finance & Economics Masters Award",
        university: "London School of Economics",
        country: "UK",
        degreeLevel: "Masters",
        coverage: "Partial",
        benefits: "£35,000 partial tuition + access to LSE finance network",
        requirements: ["Economics or Finance background", "GPA 3.5+"],
        tags: ["Finance", "Economics", "Investment", "Banking", "Financial Modeling", "Research"],
      },
      // Law
      {
        title: "Yale LLM International Law Scholarship",
        university: "Yale Law School",
        country: "USA",
        degreeLevel: "LLM",
        coverage: "Full",
        benefits: "$60,000 full scholarship + stipend",
        requirements: ["LLB with distinction", "GPA 3.6+", "2+ years legal practice"],
        tags: ["Law", "LLB", "LLM", "International Law", "Corporate Law", "Human Rights"],
      },
      // Psychology
      {
        title: "Psychology Research Grant — Mental Health",
        university: "University of Toronto",
        country: "Canada",
        degreeLevel: "PhD",
        coverage: "Full",
        benefits: "CAD 30,000/year + lab access + conference funding",
        requirements: ["Masters in Psychology", "Research proposal", "GPA 3.4+"],
        tags: ["Psychology", "Mental Health", "Research", "Counseling", "CBT", "Neuroscience"],
      },
      // Design
      {
        title: "UX & Product Design Masters Scholarship",
        university: "Pratt Institute",
        country: "USA",
        degreeLevel: "Masters",
        coverage: "Partial",
        benefits: "$45,000 scholarship + studio access",
        requirements: ["Design portfolio", "Bachelor's degree", "Figma/design tools proficiency"],
        tags: ["Design", "UX", "UI", "Product Design", "Figma", "User Research"],
      },
      // Engineering
      {
        title: "ETH Zurich Civil Engineering Excellence Award",
        university: "ETH Zurich",
        country: "Switzerland",
        degreeLevel: "Masters",
        coverage: "Full",
        benefits: "CHF 12,000/semester + research assistantship",
        requirements: ["B.E. Civil or Structural", "GPA 3.4+", "German/English proficiency"],
        tags: ["Engineering", "Civil", "Structural", "Construction", "Research", "Infrastructure"],
      },
      // HR
      {
        title: "SHRM HR Leadership Certification",
        university: "SHRM Institute",
        country: "USA",
        degreeLevel: "Professional Certification",
        coverage: "Full",
        benefits: "Full certification fees + digital badge + SHRM membership",
        requirements: ["HR background", "2+ years experience", "Bachelor's degree"],
        tags: ["Human Resources", "HR", "Recruitment", "Talent Management", "Leadership", "HRIS"],
      },
      // Marketing
      {
        title: "Oxford Digital Marketing Professional Programme",
        university: "Oxford University",
        country: "UK",
        degreeLevel: "Professional Certification",
        coverage: "Partial",
        benefits: "£20,000 partial funding + Oxford alumni network",
        requirements: ["Marketing background", "2+ years experience"],
        tags: ["Marketing", "Digital Marketing", "SEO", "Content Strategy", "Analytics", "Brand"],
      },
    ],
    skipDuplicates: true,
  });

  console.log(`✅  Seeded ${jobs.count} jobs and ${scholarships.count} scholarships.`);
}

main()
  .catch(e => {
    console.error("❌  Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
