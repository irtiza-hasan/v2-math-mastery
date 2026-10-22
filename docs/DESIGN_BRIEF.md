# Task: Redesign the Frontend of LLM-TA for Math Learning

## 1. Project and repository

You are an expert frontend engineer, UI/UX designer, and educational technology developer.

I want you to redesign my existing mathematics learning website into a polished, modern, research-oriented learning platform.

**Project name:** LLM-TA for Math Learning

**Existing GitHub repository:**
https://github.com/irtiza-hasan/v2-math-mastery

**Existing website:**
https://irtiza-hasan.github.io/v2-math-mastery/

The application currently uses React, TypeScript, Vite, KaTeX, and a Cloudflare Worker backend.

Work directly with the existing repository. Inspect the architecture and existing features before making changes.

Do not rebuild the application from scratch unless absolutely necessary. Preserve useful existing functionality.

**Important:** We are no longer calling the application "Proofwise." Replace visible branding with "LLM-TA for Math Learning."

This is a general mathematics learning application, not a proof-specific application. It must support numerical mathematics, proofs, symbolic manipulation, derivations, probability, information theory, optimization, linear algebra, real analysis, and other mathematical subjects.

## 2. Central learning philosophy

The fundamental goal of the application is mathematical learning, not simply obtaining answers.

The platform uses adaptive diagnosis, prerequisite mapping, targeted remediation, active mathematical practice, gradual solution reconstruction, retrieval practice, and transfer training.

The interface must support the complete learning journey:

1. Problem orientation
2. Minimal prerequisite mapping
3. Adaptive diagnostic assessment
4. Targeted topic training
5. Gradual integration into the original problem
6. Complete solution and understanding
7. Transfer training and review

These correspond to Phases 0–6 of the tutoring framework.

The updated tutoring prompt provided in the project context is the pedagogical specification. Preserve it for future backend integration.

The frontend should make these phases intuitive, visible, and easy to navigate, without overwhelming students.

## 3. Critical architectural decision: Course-based learning

Do NOT build a global mathematical knowledge graph across all mathematics.

Instead, organize the application by courses.

Examples:

- Real Analysis
- Information Theory
- Probability Theory
- Linear Algebra
- Optimization

A student can create a course, name it, and optionally upload a syllabus.

The syllabus defines the approximate boundaries of that course's mathematical content and provides initial topic organization.

A syllabus is not a definitive prerequisite graph. The application should eventually identify specific prerequisite relationships from mathematical content and student interactions.

Each course maintains its own:

- Saved learning sessions
- Mathematical topics
- Prerequisite relationships
- Diagnostic evidence
- Student skill profile
- Mastery and uncertainty indicators
- Review history
- Learning progress

The course is the primary organizational unit.

There is no need for a cross-course knowledge graph in this version.

## 4. Most important learning requirement: Prior knowledge informs diagnosis

This is absolutely critical.

**Previously demonstrated knowledge must never replace diagnostic testing.**

Instead, a student's previous performance should help determine WHERE the new diagnostic assessment begins.

For example:

Suppose a student has already completed several Real Analysis sessions involving Cauchy sequences.

The student opens a new problem involving compactness.

The application should:

1. Analyze the new mathematical problem.
2. Construct its own minimal prerequisite map.
3. Compare those prerequisites with the student's existing Real Analysis skill profile.
4. Identify which topics have strong previous evidence, weak evidence, or no evidence.
5. Use that information to select the initial difficulty and focus of the new diagnostic questions.
6. Continue diagnosis according to the adaptive assessment rules.
7. Update the course-level skill profile using newly observed performance.

A previous successful session does not automatically establish current mastery.

Knowledge may decay, may have been demonstrated only in a narrow context, or may not transfer to the new problem.

Therefore:

**Prior knowledge is a diagnostic prior, not a diagnostic substitute.**

This principle should be explicitly reflected in the frontend architecture, labels, data structures, and future API interfaces.

Do not treat unassessed skills as failed skills.

Do not present an AI-generated numerical mastery percentage as a scientifically validated assessment without sufficient supporting evidence.

## 5. Persistent learning sessions

Every mathematical problem creates an automatically saved learning session within its course.

Students should be able to:

- Start a new problem
- Return to previously saved sessions
- Resume exactly where they stopped
- Review their previous questions and answers
- Revisit prerequisite explanations
- Inspect their learning path
- Continue remediation
- Restart retrieval practice
- Rename sessions
- Search sessions
- Archive or delete sessions

A learning session stores:

- Original mathematical problem
- Uploaded problem images, if applicable
- Course association
- Problem-specific prerequisite graph
- Current learning phase
- Current question
- Questions previously answered
- Student responses and optional reasoning
- Feedback and explanations
- Diagnosed weaknesses
- Remediation progress
- Integration progress
- Transfer exercises
- Session history

Important: Saving must be automatic.

For this frontend revamp, implement a reliable persistence layer appropriate to the existing architecture. If a database or authentication system is not yet available, preserve browser-based functionality with clearly documented limitations and design the data-access layer so backend persistence can be added later.

Do not falsely advertise browser-only storage as synchronized cloud storage.

## 6. Course dashboard

Create a polished course-based dashboard.

When students open the application, they should see their courses.

Each course card should display:

- Course name
- Brief course description
- Number of saved learning sessions
- Recently studied topics
- Skills requiring review
- Resume learning action

Example:

**Real Analysis**

Recent sessions:
- Cauchy sequences and completeness
- Uniform convergence
- Heine–Borel theorem

Course learning status:
- Skills with strong evidence
- Developing skills
- Skills needing review
- Not yet assessed

Provide a clear "New Mathematical Problem" action.

The interface should look like a serious educational platform suitable for university students rather than a generic chatbot.

## 7. Course-level mathematical knowledge map

Each course should have a dedicated "My Skills" screen.

This screen visualizes the student's mathematical knowledge within the course.

For Real Analysis, example topics might include:

- Metric spaces
- Sequences
- Cauchy sequences
- Convergence
- Compactness
- Continuity
- Series
- Uniform convergence

Represent prerequisite relationships using an interactive graph.

Each skill should display an evidence-based status:

- Not assessed
- Developing
- Strong evidence
- Needs review

A skill's detail panel should include:

- Mathematical topic name
- Description
- Relevant prerequisites
- Current evidence summary
- Recently answered questions
- Common errors, when observed
- Sessions where the skill appeared
- Suggested review activity

Avoid arbitrary mastery percentages when the available evidence cannot justify them.

Students should understand why the system considers a skill secure, developing, or uncertain.

## 8. Problem-specific prerequisite map

Every new mathematical problem must also have its own prerequisite graph.

This is distinct from the course-level skill graph.

The problem-specific graph represents the minimal mathematical knowledge needed to solve that exact problem.

Each node should show:

- Prerequisite topic
- Why it matters for this problem
- Dependencies
- Previous evidence from the course
- Current diagnostic status
- Current remediation status

Students should be able to select a prerequisite node and inspect its mathematical meaning.

The map should remain accessible throughout the learning session.

Do not create an unnecessarily large prerequisite tree.

Do not invent dependency relationships between unrelated topics.

## 9. Learning workspace design

The learning workspace should be the most polished part of the application.

Use a responsive three-column layout on desktop:

**Left sidebar: Navigation**

Include:

- Course name
- Saved sessions
- New problem
- Current learning phases
- Review practice
- Course skills

**Center: Mathematical learning workspace**

This area must receive most of the visual attention.

Display:

- Current question
- Mathematical expressions
- Multiple-choice answers
- Optional explanation input
- Feedback
- Worked examples when appropriate
- Mathematical scratchwork
- Gradual solution reconstruction

**Right sidebar: Contextual learning insights**

Include:

- Original mathematical problem
- Current prerequisite
- Relevant prior learning
- Current diagnostic evidence
- Helpful session notes
- Accessible prerequisite map

Make both sidebars collapsible.

On smaller screens, prioritize the mathematical question and move the secondary panels into accessible drawers or tabs.

Avoid excessive visual clutter.

## 10. Multiple-choice question interface

Preserve the successful question interaction from the original application and presentation slides.

Each question must show:

- Clear mathematical prompt
- Correctly rendered LaTeX
- Five explicit options A–E
- Independent option F: "I don't know yet"
- Optional reasoning field
- Submit button

Only one question should appear at a time.

After submission, show feedback before moving to the next question.

The GUI should support optional feedback without requiring an answer selection.

During diagnostic assessment, incorrect answers should support the tutoring framework's "Was this a silly mistake?" verification step.

For topic training, support targeted replacement questions and varied difficulty.

Never reveal correct answers prematurely.

## 11. Stage-specific learning interfaces

Design differentiated interfaces for each phase.

### Phase 0 — Problem orientation

Provide a clean interface for:

- Typing a mathematics problem
- Pasting LaTeX
- Uploading a textbook screenshot
- Uploading relevant problem material
- Reviewing interpreted problem statements
- Providing initial familiarity or confusion feedback

### Phase 1 — Prerequisite mapping

Show the interactive minimal dependency graph.

### Phase 2 — Adaptive diagnostics

Show one question at a time, current question count, targeted prerequisite, and optional reasoning.

The initial diagnostic difficulty may depend on previous course evidence.

Do not remove the diagnostic process because of previous performance.

### Phase 3 — Topic training

Display:

- Current weak topic
- Concept explanation
- Worked examples
- Current practice exercise
- Difficulty progression
- Targeted remediation feedback
- Topic-specific learning evidence

### Phase 4 — Gradual integration

Provide a mathematical workspace for reconstructing the original solution.

Support:

- Typed reasoning
- LaTeX-friendly mathematical entry
- Mathematical scratchpad
- Uploaded handwritten work
- Gradually revealed hints
- Short derivation checkpoints

The tutor should guide students through the solution rather than immediately reveal it.

### Phase 5 — Solution and understanding

Present the unlocked solution with:

- Complete mathematical derivation
- Clear logical steps
- Explanations
- Common mistakes
- Related mathematical interpretations

### Phase 6 — Transfer training

Provide near-, mid-, and wider-transfer practice.

Show how the same mathematical structures and solution strategies apply to related problems.

This phase is essential and should not be omitted.

## 12. Visual design direction

Use the previously discussed clean white-and-teal aesthetic.

Desired characteristics:

- Modern academic appearance
- White or very light neutral background
- Teal primary accent
- Restrained supporting colors
- Clean cards
- Subtle borders
- Rounded corners
- Carefully designed typography
- Generous spacing
- Professional icons
- Excellent mathematical readability
- Clear visual hierarchy
- Accessible controls
- Responsive layouts

Use visual inspiration from the supplied LLM-TA presentation and earlier six-screen GUI mockups.

Improve those designs rather than reproducing them mechanically.

Use KaTeX for mathematical rendering.

The application should look appropriate for an advanced university mathematics learning environment while remaining approachable for beginners.

Avoid excessive gradients, distracting animations, or gamification that distracts from mathematical thinking.

## 13. Reusable frontend components

Organize the application around reusable components such as:

- AppShell
- CourseDashboard
- CourseCard
- CourseWorkspace
- SessionList
- SessionCard
- LearningSession
- LearningPhaseNavigation
- ProblemInput
- ProblemOrientation
- PrerequisiteGraph
- SkillNode
- CourseSkillMap
- SkillEvidencePanel
- DiagnosticQuestion
- MathMultipleChoice
- OptionalReasoningInput
- FeedbackPanel
- WorkedExamplePanel
- TopicTraining
- MathematicalScratchpad
- IntegrationWorkspace
- SolutionViewer
- TransferPractice
- ReviewQueue

These names are illustrative. Adapt them to the existing codebase as appropriate.

Avoid placing the entire application in one enormous React component.

## 14. Persistence and data architecture

Separate the following concepts in the frontend data model:

**Course**

Contains syllabus information, sessions, and course-specific skill records.

**Learning Session**

Contains the original problem, learning phases, conversations, question attempts, and local prerequisite map.

**Course Skill**

Represents a mathematical concept within one course.

**Skill Evidence**

Represents an observed student response and what it demonstrates about a mathematical skill.

**Skill State**

Represents the current interpretation of accumulated evidence, including uncertainty and review needs.

Ensure multiple sessions can reference the same course skill without duplicating its identity.

Preserve historical performance records rather than overwriting them with a single summary.

Use stable identifiers for courses, sessions, and mathematical skills.

## 15. API integration boundaries

The frontend will ultimately communicate with the OpenAI API through a secure backend.

Do not expose API keys in browser code.

For this task, focus on the frontend redesign and its interfaces with the backend.

Do not replace the existing AI provider or rewrite the tutoring engine unless necessary for frontend compatibility and explicitly documented.

Define clear data contracts for:

- Problem analysis
- Prerequisite generation
- Diagnostic questions
- Student responses
- Feedback
- Skill evidence updates
- Topic training
- Integration
- Solution reconstruction
- Transfer practice

If an API feature is unavailable, use a clearly identified development/demo state rather than presenting fabricated progress as real student evidence.

## 16. Implementation workflow

Follow this order:

1. Inspect the existing repository and identify reusable components.
2. Review the supplied design inspiration.
3. Create a coherent frontend design plan and component hierarchy.
4. Implement the course-based navigation and dashboard.
5. Implement saved-session organization.
6. Implement course-level skill visualization.
7. Implement problem-level prerequisite visualization.
8. Improve the learning workspace and question interface.
9. Implement responsive layouts and stage-specific screens.
10. Validate the existing functionality.
11. Run TypeScript checks, existing tests, and the production build.
12. Review the resulting interface for accessibility, readability, and mathematical rendering.

Do not remove working functionality during the redesign.

Keep the scope focused on the frontend and supporting client-side state.

If the available connected GitHub workflow supports a preview branch, develop the changes on a dedicated branch and prepare a pull request instead of directly modifying production.

Do not merge or deploy to the production website without approval.

## 17. Expected deliverables

Produce:

1. A redesigned frontend named **LLM-TA for Math Learning**.
2. Course creation and course-based navigation.
3. Automatically saved and resumable learning sessions.
4. Course-level mathematical skill visualization.
5. Problem-specific interactive prerequisite maps.
6. A polished stage-based mathematics learning workspace.
7. Responsive and accessible UI components.
8. Clear data models for future OpenAI API integration.
9. Documentation describing the new architecture and implemented features.
10. A summary of what is fully implemented, what is demonstrated using mock data, and what still requires backend integration.

## 18. Final priorities

If tradeoffs are necessary, prioritize in this order:

1. Mathematical learning usability.
2. Clear prerequisite mapping.
3. Adaptive diagnostic interface.
4. Accurate preservation of learning sessions.
5. Course-specific skill tracking.
6. Reliable mathematical rendering and input.
7. Clean visual design.
8. Additional visual polish.

Remember the defining design principles:

**One course contains multiple saved mathematical learning sessions.**

**Every problem has its own minimal prerequisite map.**

**Every course accumulates evidence about the student's mathematical skills.**

**Previous evidence determines where a new diagnostic begins, but never eliminates diagnostic assessment.**

**The interface must encourage students to perform mathematical work rather than passively consume solutions.**

Build an excellent educational frontend that embodies these principles while preserving the strongest features of the existing application.