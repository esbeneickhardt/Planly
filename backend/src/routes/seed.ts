/**
 * Seed routes - admin-only endpoint to populate a fresh instance with demo data.
 *
 * Creates two sample projects (Podcast Launch, Build a Rocket) with tasks, sub-plans,
 * and dependencies so the app is ready to demo immediately after installation.
 * Requires isAdmin access.
 */
import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../db/client';
import { requireAdmin } from '../middleware/auth';

// Shorthand type for seeding tasks without requiring the productId and createdBy fields upfront
type TaskInput = Omit<Prisma.TaskUncheckedCreateInput, 'productId' | 'createdBy'>;

export async function seedRoutes(app: FastifyInstance) {
  // Create two sample projects (Podcast Launch, Build a Rocket) with tasks, sub-plans, and dependencies
  app.post('/api/seed-examples', { preHandler: requireAdmin }, async (req, reply) => {
    const userId = req.user.userId;

    // Create a second demo user with a random unguessable password (never revealed)
    let demoUser = await prisma.user.findUnique({ where: { username: 'prof_korolev' } });
    if (!demoUser) {
      const demoPassword = randomBytes(32).toString('hex');
      demoUser = await prisma.user.create({
        data: {
          username: 'prof_korolev',
          email: 'wernher.korolev@planly.dev',
          passwordHash: await bcrypt.hash(demoPassword, 12),
          realName: 'Prof. Wernher Korolev',
          avatarEmoji: '🧑‍🔬',
          emailVerified: true,
        },
      });
    }

    const dep = (dependentId: string, prerequisiteId: string) =>
      prisma.taskDependency.create({ data: { dependentId, prerequisiteId } });

    // ── Product 1: Podcast Launch ──────────────────────────────────────
    const team1 = await prisma.team.create({
      data: { name: 'Podcast Team', members: { create: [{ userId }, { userId: demoUser.id }] } },
    });
    const p1deadline = new Date();
    p1deadline.setDate(p1deadline.getDate() + 14);
    const p1 = await prisma.product.create({
      data: {
        name: 'Podcast Launch',
        emoji: '🎙️',
        description: `# 🎙️ Podcast Launch

A weekly show at the intersection of **AI, software engineering, and building in public**. Honest conversations about making real things with new tools - recorded, edited, and shipped every week.

## Why this exists

Most tech podcasts talk *about* AI from a safe distance. We go hands-on: each episode follows a real project in progress, with real code, real decisions, and honest post-mortems. No hype, no "the future of work" takes - just builders talking to builders.

## Episode format

| Segment | Duration | Description |
|---------|----------|-------------|
| Cold open | 3 min | The problem we're solving this week |
| Deep dive | 25 min | One technical topic, zero hand-waving |
| Live demo | 15 min | Actual code, actual output, actual errors |
| Retro | 7 min | What surprised us - good and bad |

## Distribution

- **Spotify** - primary platform, auto-published via RSS
- **Apple Podcasts** - submitted through Podcasters Connect
- **YouTube** - full video recording of every session, live within 24 h of audio release
- **Show website** - episode notes, code links, and searchable transcripts`,
        deadline: p1deadline,
        teamId: team1.id,
        ownerId: userId,
      },
    });

    const t1 = (data: TaskInput) => prisma.task.create({ data: { ...data, productId: p1.id, createdBy: userId } });

    // ── Setup phase (done / in progress) ── purple / blue / green ─────
    const s1 = await t1({
      name: 'Define niche & format',
      status: 'done',
      ownerId: userId,
      color: '#7c3aed',
      completedAt: new Date(),
      completedBy: userId,
    });
    // ── Prep for recording ── blue ─────────────────────────────────────
    const p1a = await t1({ name: 'Identify topic', status: 'todo', ownerId: userId, color: '#3b82f6' });
    const p1b = await t1({ name: 'Find guest', status: 'todo', ownerId: userId, color: '#3b82f6' });
    // Three parallel tracks after finding the guest
    const p1c = await t1({ name: 'Research topic', status: 'backlog', ownerId: demoUser.id, color: '#3b82f6' });
    const p1d = await t1({ name: 'Prepare questions', status: 'backlog', ownerId: userId, color: '#3b82f6' });
    const p1e = await t1({ name: 'Find date', status: 'backlog', ownerId: demoUser.id, color: '#3b82f6' });
    const p1f = await t1({ name: 'Buy snacks & supplies', status: 'backlog', ownerId: demoUser.id, color: '#3b82f6' });

    // ── Episode production - Record episode is the milestone ───────────
    const rdRec = new Date();
    rdRec.setDate(rdRec.getDate() + 7);
    const prod1 = await t1({
      name: 'Record episode',
      status: 'backlog',
      ownerId: userId,
      deadline: rdRec,
      color: '#f59e0b',
    });
    const prod2 = await t1({ name: 'Edit audio', status: 'backlog', ownerId: demoUser.id, color: '#10b981' });
    const prod3 = await t1({ name: 'Guest approval on final cut', status: 'backlog', ownerId: userId, color: '#10b981' });
    const prod4 = await t1({ name: 'Create thumbnail', status: 'backlog', ownerId: demoUser.id, color: '#10b981' });
    const prod5 = await t1({ name: 'Write description & show notes', status: 'backlog', ownerId: userId, color: '#10b981' });

    // Milestone: Episode Produced
    const rdProd = new Date();
    rdProd.setDate(rdProd.getDate() + 11);
    const mProd = await t1({
      name: 'Episode Produced',
      status: 'backlog',
      ownerId: userId,
      deadline: rdProd,
      color: '#f59e0b',
    });

    // ── Publishing ── amber ────────────────────────────────────────────
    const pub1 = await t1({ name: 'Upload to hosting (Buzzsprout)', status: 'backlog', ownerId: userId, color: '#f59e0b' });
    const pub2 = await t1({ name: 'Submit to Apple Podcasts', status: 'backlog', ownerId: demoUser.id, color: '#f59e0b' });
    const pub3 = await t1({ name: 'Submit to Spotify', status: 'backlog', ownerId: userId, color: '#f59e0b' });
    const pub4 = await t1({ name: 'Submit to YouTube & Google', status: 'backlog', ownerId: demoUser.id, color: '#f59e0b' });
    const pub5 = await t1({ name: 'Announce on social media', status: 'backlog', ownerId: userId, color: '#f59e0b' });

    // Milestone: Episode 1 Live
    const rdLive = new Date();
    rdLive.setDate(rdLive.getDate() + 14);
    const sm1 = await t1({
      name: 'Episode 1 Live',
      status: 'backlog',
      ownerId: userId,
      deadline: rdLive,
      color: '#f59e0b',
    });

    await prisma.subtask.createMany({
      data: [
        { taskId: prod2.id, name: 'Trim dead air & filler words', completed: false, order: 0 },
        { taskId: prod2.id, name: 'Normalise loudness (LUFS -16)', completed: false, order: 1 },
        { taskId: prod2.id, name: 'Add intro / outro music', completed: false, order: 2 },
        { taskId: pub1.id, name: 'Write episode title & tags', completed: false, order: 0 },
        { taskId: pub1.id, name: 'Set explicit flag & category', completed: false, order: 1 },
        { taskId: pub1.id, name: 'Schedule release date', completed: false, order: 2 },
      ],
    });

    // Prep deps
    await dep(p1a.id, s1.id);       // identify topic after knowing the niche
    await dep(p1b.id, p1a.id);      // find guest after identifying topic
    // Three parallel tracks once a guest is confirmed
    await dep(p1c.id, p1b.id);      // research topic
    await dep(p1d.id, p1c.id);      // prepare questions after research
    await dep(p1e.id, p1b.id);      // find date
    await dep(p1f.id, p1b.id);      // buy snacks

    // Record episode milestone - all three tracks must be done
    await dep(prod1.id, p1d.id);
    await dep(prod1.id, p1e.id);
    await dep(prod1.id, p1f.id);

    // Post-recording: edit / thumbnail / show notes fan out in parallel
    await dep(prod2.id, prod1.id);
    await dep(prod4.id, prod1.id);
    await dep(prod5.id, prod1.id);

    // All three converge into guest approval
    await dep(prod3.id, prod2.id);
    await dep(prod3.id, prod4.id);
    await dep(prod3.id, prod5.id);

    // Episode Produced milestone
    await dep(mProd.id, prod3.id);

    // Publishing deps
    await dep(pub1.id, mProd.id);
    await dep(pub2.id, pub1.id);
    await dep(pub3.id, pub1.id);
    await dep(pub4.id, pub1.id);
    await dep(pub5.id, pub1.id);

    // Episode 1 Live milestone
    await dep(sm1.id, pub2.id);
    await dep(sm1.id, pub3.id);
    await dep(sm1.id, pub4.id);
    await dep(sm1.id, pub5.id);

    await prisma.productConnection.create({ data: { productId: p1.id, taskId: sm1.id } });

    // ── Podcast: Sub-plan 1 - Episode 1 (active) ──────────────────────
    const sp1Start = new Date();
    const sp1End = new Date();
    sp1End.setDate(sp1End.getDate() + 14);
    const sp1 = await prisma.sprint.create({
      data: { productId: p1.id, name: 'Episode 1', color: '#7c3aed', startDate: sp1Start, endDate: sp1End },
    });
    await prisma.sprintTask.createMany({
      data: [
        { sprintId: sp1.id, taskId: p1a.id },
        { sprintId: sp1.id, taskId: p1b.id },
        { sprintId: sp1.id, taskId: p1c.id },
        { sprintId: sp1.id, taskId: p1d.id },
        { sprintId: sp1.id, taskId: p1e.id },
        { sprintId: sp1.id, taskId: p1f.id },
        { sprintId: sp1.id, taskId: prod1.id },
      ],
    });

    // ── Product 2: Rocket Build ────────────────────────────────────────
    const team2 = await prisma.team.create({
      data: { name: 'Rocket Team', members: { create: [{ userId }, { userId: demoUser.id }] } },
    });
    const p2deadline = new Date();
    p2deadline.setDate(p2deadline.getDate() + 90); // project started 90 days ago, 90 days to go
    const p2 = await prisma.product.create({
      data: {
        name: 'Build a Rocket',
        emoji: '🚀',
        description: `# 🚀 Build a Rocket

A **180-day project** to design, build, and launch a single-stage rocket from first principles - concept to launch in six engineering phases.

## Mission parameters

| Parameter | Value |
|-----------|-------|
| Target altitude | 3,000 m AGL |
| Payload | 500 g inert mass |
| Recovery system | Dual-deploy parachute (drogue @ apogee, main @ 300 m) |
| Propulsion | Hybrid motor - HTPB fuel / N₂O oxidiser |
| Airframe material | Carbon fibre overwrap on aluminium tube |
| Launch window | Day 180 |

## Phase overview

\`\`\`mermaid
gantt
  title Rocket Build - 180-Day Roadmap
  dateFormat  YYYY-MM-DD
  section Design
  Concept & design freeze    :done,    p1, 2025-01-01, 20d
  section Engineering
  Propulsion development     :active,  p2, after p1, 40d
  Structural engineering     :active,  p3, after p1, 60d
  Avionics & software        :         p4, after p1, 60d
  Ground systems             :         p5, after p1, 60d
  section Integration
  Systems integration        :         p6, after p2, 40d
  Testing & rehearsal        :         p7, after p6, 40d
  section Launch
  Launch day                 :crit,    p8, after p7, 1d
\`\`\`

## Engineering workstreams

### 🔴 Propulsion
Custom hybrid motor designed in-house. Engine specification drives everything downstream - thrust curve determines fin sizing, which determines airframe loads, which determines material selection. Static fire test on Day 60 is the first hard gate.

### 🔵 Structural
Carbon fibre airframe, aluminium coupler, fibreglass nose cone, trapezoidal fins. Material selection trade-off (CF vs. fibreglass) is still open pending final mass budget from propulsion. Fin geometry must survive max-Q at ~Mach 0.8.

### 🟢 Avionics
Dual-redundant flight computers (primary + backup). GPS logging at 10 Hz. Telemetry downlink over 433 MHz. Flight software implements dual-deploy ejection logic with barometric + accelerometer cross-check - both sensors must agree before firing any charge.

### 🟡 Ground systems
Mobile launch pad rated to 2 kN peak thrust. Oxidiser filling system with pressure relief and remote vent. Range safety system with RF arm/disarm and independent flight-termination charge - **no range approval without a working safety system, no exceptions**.

## Key milestones

| Milestone | Day | Notes |
|-----------|-----|-------|
| Design Freeze | 20 | All major geometry locked. No changes after this without a full CM review. |
| Engine Test Complete | 60 | Static fire on test stand. Go/no-go for airframe fabrication. |
| Structural Complete | 80 | Airframe, nose cone, fins assembled and bonded. |
| Systems Integration | 120 | All subsystems mated. First powered avionics checkout. |
| Launch Ready | 160 | Range safety approval, countdown rehearsal complete. |
| 🚀 Launch Day | 180 | T-0. |

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Motor under-performs | Medium | High | Conservative Isp assumption in trajectory sim; test early |
| Fin flutter at max-Q | Low | Critical | FEA check; chamfer leading edge; accept lower max speed if needed |
| Avionics false ejection | Low | Critical | Dual-sensor cross-check; bench-test 100× before integration |
| Range permit delayed | Medium | High | Submit paperwork 60 days out; have backup site identified |

## Subtask highlights

**Trajectory simulation** (Phase 1) resolves three hard numbers before any metal is cut:
- Δv budget and required impulse class
- Re-entry heating on nose cone at apogee
- Apogee location and recovery drift zone (critical for site selection)

**Thrust chamber fabrication** (Phase 2) is the longest single task - combustion chamber machining, injector plate, and nozzle are each multi-day jobs with external vendor dependencies.

---

> *"Simplicity is the ultimate sophistication - especially when the thing has to survive Mach 0.8 and come back in one piece."*`,
        deadline: p2deadline,
        teamId: team2.id,
        ownerId: userId,
      },
    });

    const t2 = (data: TaskInput & { canvasX?: number; canvasY?: number }) =>
      prisma.task.create({ data: { ...data, productId: p2.id, createdBy: userId } });

    // Phase 1 - Concept & Design (done) ── purple
    const r1 = await t2({
      name: 'Define mission objectives',
      status: 'done',
      ownerId: userId,
      color: '#7c3aed',
      completedAt: new Date(),
      completedBy: userId,
      canvasX: 80,
      canvasY: 250,
    });
    const r2 = await t2({
      name: 'Payload requirements',
      status: 'done',
      ownerId: demoUser.id,
      color: '#7c3aed',
      completedAt: new Date(),
      completedBy: userId,
      canvasX: 80,
      canvasY: 400,
    });
    const r3 = await t2({
      name: 'Trajectory simulation',
      status: 'done',
      ownerId: userId,
      color: '#7c3aed',
      completedAt: new Date(),
      completedBy: userId,
      canvasX: 80,
      canvasY: 550,
    });
    const r4 = await t2({
      name: 'Design review & sign-off',
      status: 'done',
      ownerId: userId,
      color: '#7c3aed',
      completedAt: new Date(),
      completedBy: userId,
      canvasX: 260,
      canvasY: 400,
    });

    // Phase 2 - Propulsion (done) ── red
    const r5 = await t2({
      name: 'Engine specification',
      status: 'done',
      ownerId: userId,
      color: '#ef4444',
      completedAt: new Date(),
      completedBy: userId,
      canvasX: 580,
      canvasY: 150,
    });
    const r6 = await t2({
      name: 'Fuel system design',
      status: 'done',
      ownerId: demoUser.id,
      color: '#ef4444',
      completedAt: new Date(),
      completedBy: demoUser.id,
      canvasX: 580,
      canvasY: 300,
    });
    const r7 = await t2({
      name: 'Thrust chamber fabrication',
      status: 'done',
      ownerId: userId,
      color: '#ef4444',
      completedAt: new Date(),
      completedBy: userId,
      canvasX: 740,
      canvasY: 150,
    });
    const r8 = await t2({
      name: 'Static fire test',
      status: 'done',
      ownerId: userId,
      color: '#ef4444',
      completedAt: new Date(),
      completedBy: userId,
      canvasX: 740,
      canvasY: 300,
    });

    // Phase 3 - Structural Engineering (in progress) ── blue
    const r9 = await t2({
      name: 'Airframe design',
      status: 'done',
      ownerId: demoUser.id,
      color: '#3b82f6',
      completedAt: new Date(),
      completedBy: demoUser.id,
      canvasX: 580,
      canvasY: 470,
    });
    const r10 = await t2({
      name: 'Material selection',
      status: 'done',
      ownerId: userId,
      color: '#3b82f6',
      completedAt: new Date(),
      completedBy: userId,
      canvasX: 580,
      canvasY: 620,
    });
    const r11 = await t2({
      name: 'Nose cone fabrication',
      status: 'in_progress',
      ownerId: demoUser.id,
      color: '#3b82f6',
      canvasX: 740,
      canvasY: 470,
    });
    const r12 = await t2({
      name: 'Fin & interstage assembly',
      status: 'todo',
      ownerId: userId,
      color: '#3b82f6',
      canvasX: 740,
      canvasY: 620,
    });

    // Milestones: Engine Test (done) & Structural Complete (upcoming) ── amber
    const rd60 = new Date();
    rd60.setDate(rd60.getDate() - 30); // Engine Test was 30 days ago
    const rd80 = new Date();
    rd80.setDate(rd80.getDate() + 10); // Structural Complete in 10 days
    const rm2 = await t2({
      name: 'Engine Test Complete',
      status: 'done',
      ownerId: userId,
      color: '#f59e0b',
      deadline: rd60,
      completedAt: new Date(),
      completedBy: userId,
      canvasX: 900,
      canvasY: 225,
    });
    const rm3 = await t2({
      name: 'Structural Complete',
      status: 'backlog',
      ownerId: demoUser.id,
      color: '#f59e0b',
      deadline: rd80,
      canvasX: 900,
      canvasY: 545,
    });

    // Phase 4 - Avionics & Software (backlog) ── green
    const r13 = await t2({
      name: 'Flight computer design',
      status: 'backlog',
      ownerId: userId,
      color: '#10b981',
      canvasX: 1060,
      canvasY: 100,
    });
    const r14 = await t2({
      name: 'Navigation & GPS integration',
      status: 'backlog',
      ownerId: demoUser.id,
      color: '#10b981',
      canvasX: 1060,
      canvasY: 250,
    });
    const r15 = await t2({
      name: 'Telemetry system',
      status: 'backlog',
      ownerId: userId,
      color: '#10b981',
      canvasX: 1060,
      canvasY: 400,
    });
    const r16 = await t2({
      name: 'Flight software',
      status: 'backlog',
      ownerId: demoUser.id,
      color: '#10b981',
      canvasX: 1220,
      canvasY: 250,
    });

    // Phase 5 - Ground Systems (backlog) ── amber
    const r17 = await t2({
      name: 'Launch pad design',
      status: 'backlog',
      ownerId: userId,
      color: '#f59e0b',
      canvasX: 1060,
      canvasY: 580,
    });
    const r18 = await t2({
      name: 'Fuel loading system',
      status: 'backlog',
      ownerId: demoUser.id,
      color: '#f59e0b',
      canvasX: 1060,
      canvasY: 730,
    });
    const r19 = await t2({
      name: 'Range safety system',
      status: 'backlog',
      ownerId: userId,
      color: '#f59e0b',
      canvasX: 1220,
      canvasY: 650,
    });

    // Milestone: Systems Integration
    const rd120 = new Date();
    rd120.setDate(rd120.getDate() + 30);
    const rm4 = await t2({
      name: 'Systems Integration Complete',
      status: 'backlog',
      ownerId: userId,
      color: '#f59e0b',
      deadline: rd120,
      canvasX: 1380,
      canvasY: 400,
    });

    // Phase 6 - Testing (backlog) ── cyan
    const r20 = await t2({
      name: 'Component integration',
      status: 'backlog',
      ownerId: userId,
      color: '#06b6d4',
      canvasX: 1540,
      canvasY: 200,
    });
    const r21 = await t2({
      name: 'Vibration & acoustic testing',
      status: 'backlog',
      ownerId: demoUser.id,
      color: '#06b6d4',
      canvasX: 1540,
      canvasY: 380,
    });
    const r22 = await t2({
      name: 'Full systems test',
      status: 'backlog',
      ownerId: userId,
      color: '#06b6d4',
      canvasX: 1700,
      canvasY: 280,
    });
    const r23 = await t2({
      name: 'Launch rehearsal',
      status: 'backlog',
      ownerId: demoUser.id,
      color: '#06b6d4',
      canvasX: 1700,
      canvasY: 480,
    });

    // Final milestones
    const rd160 = new Date();
    rd160.setDate(rd160.getDate() + 70);
    const rd180 = new Date();
    rd180.setDate(rd180.getDate() + 90);
    const rm5 = await t2({
      name: 'Launch Ready',
      status: 'backlog',
      ownerId: userId,
      color: '#f59e0b',
      deadline: rd160,
      canvasX: 1860,
      canvasY: 380,
    });
    const rm6 = await t2({
      name: '🚀 Launch Day!',
      status: 'backlog',
      ownerId: userId,
      color: '#f59e0b',
      deadline: rd180,
      canvasX: 2020,
      canvasY: 380,
    });

    // Design Freeze milestone - completed 70 days ago
    const rd20 = new Date();
    rd20.setDate(rd20.getDate() - 70);
    const rm1 = await t2({
      name: 'Design Freeze',
      status: 'done',
      ownerId: userId,
      color: '#f59e0b',
      deadline: rd20,
      completedAt: new Date(),
      completedBy: userId,
      canvasX: 420,
      canvasY: 400,
    });

    await prisma.subtask.createMany({
      data: [
        { taskId: r3.id, name: 'Calculate orbit & delta-v budget', completed: true, order: 0 },
        { taskId: r3.id, name: 'Re-entry heating analysis', completed: true, order: 1 },
        { taskId: r3.id, name: 'Apogee & recovery zone mapping', completed: true, order: 2 },
        { taskId: r7.id, name: 'Machine combustion chamber', completed: true, order: 0 },
        { taskId: r7.id, name: 'Injector plate design', completed: true, order: 1 },
        { taskId: r7.id, name: 'Nozzle fabrication', completed: true, order: 2 },
        { taskId: r22.id, name: 'Go/No-go systems checklist', completed: false, order: 0 },
        { taskId: r22.id, name: 'Countdown simulation', completed: false, order: 1 },
        { taskId: r22.id, name: 'Post-test inspection & sign-off', completed: false, order: 2 },
      ],
    });

    // Phase 1 internal deps
    await dep(r2.id, r1.id);
    await dep(r3.id, r1.id);
    await dep(r4.id, r2.id);
    await dep(r4.id, r3.id);

    // Design Freeze gates everything
    await dep(rm1.id, r4.id);
    await dep(r5.id, rm1.id);
    await dep(r6.id, rm1.id);
    await dep(r9.id, rm1.id);
    await dep(r10.id, rm1.id);
    await dep(r13.id, rm1.id);
    await dep(r14.id, rm1.id);
    await dep(r15.id, rm1.id);
    await dep(r17.id, rm1.id);

    // Phase 2 - Propulsion
    await dep(r7.id, r5.id);
    await dep(r7.id, r6.id);
    await dep(r8.id, r7.id);
    await dep(rm2.id, r8.id);

    // Phase 3 - Structural
    await dep(r11.id, r9.id);
    await dep(r11.id, r10.id);
    await dep(r12.id, r11.id);
    await dep(rm3.id, r12.id);

    // Phase 4 - Avionics
    await dep(r16.id, r13.id);
    await dep(r16.id, r14.id);

    // Phase 5 - Ground systems
    await dep(r18.id, r17.id);
    await dep(r19.id, r17.id);

    // Systems Integration needs propulsion, structural, and avionics done
    await dep(rm4.id, rm2.id);
    await dep(rm4.id, rm3.id);
    await dep(rm4.id, r16.id);
    await dep(rm4.id, r15.id);
    await dep(rm4.id, r18.id);
    await dep(rm4.id, r19.id);

    // Phase 6 - Testing
    await dep(r20.id, rm4.id);
    await dep(r21.id, r20.id);
    await dep(r22.id, r21.id);
    await dep(r23.id, r22.id);

    // Final milestones
    await dep(rm5.id, r23.id);
    await dep(rm6.id, rm5.id);

    await prisma.productConnection.create({ data: { productId: p2.id, taskId: rm6.id } });

    // ── Rocket: Sub-plan 1 - Design & Concept (completed, -90 to -60 days) ──
    const rsp1s = new Date(); rsp1s.setDate(rsp1s.getDate() - 90);
    const rsp1e = new Date(); rsp1e.setDate(rsp1e.getDate() - 60);
    const rsp1 = await prisma.sprint.create({
      data: { productId: p2.id, name: 'Design & Concept', color: '#7c3aed', startDate: rsp1s, endDate: rsp1e },
    });
    await prisma.sprintTask.createMany({
      data: [
        { sprintId: rsp1.id, taskId: r1.id },
        { sprintId: rsp1.id, taskId: r2.id },
        { sprintId: rsp1.id, taskId: r3.id },
        { sprintId: rsp1.id, taskId: r4.id },
        { sprintId: rsp1.id, taskId: rm1.id },
      ],
    });

    // ── Rocket: Sub-plan 2 - Propulsion Build (completed, -60 to -30 days) ──
    const rsp2s = new Date(); rsp2s.setDate(rsp2s.getDate() - 60);
    const rsp2e = new Date(); rsp2e.setDate(rsp2e.getDate() - 30);
    const rsp2 = await prisma.sprint.create({
      data: { productId: p2.id, name: 'Propulsion Build', color: '#ef4444', startDate: rsp2s, endDate: rsp2e },
    });
    await prisma.sprintTask.createMany({
      data: [
        { sprintId: rsp2.id, taskId: r5.id },
        { sprintId: rsp2.id, taskId: r6.id },
        { sprintId: rsp2.id, taskId: r7.id },
        { sprintId: rsp2.id, taskId: r8.id },
        { sprintId: rsp2.id, taskId: rm2.id },
      ],
    });

    // ── Rocket: Sub-plan 3 - Structural Build (active, -30 days to +20 days) ──
    const rsp3s = new Date(); rsp3s.setDate(rsp3s.getDate() - 30);
    const rsp3e = new Date(); rsp3e.setDate(rsp3e.getDate() + 20);
    const rsp3 = await prisma.sprint.create({
      data: { productId: p2.id, name: 'Structural Build', color: '#3b82f6', startDate: rsp3s, endDate: rsp3e },
    });
    await prisma.sprintTask.createMany({
      data: [
        { sprintId: rsp3.id, taskId: r9.id },
        { sprintId: rsp3.id, taskId: r10.id },
        { sprintId: rsp3.id, taskId: r11.id },
        { sprintId: rsp3.id, taskId: r12.id },
        { sprintId: rsp3.id, taskId: rm3.id },
      ],
    });

    reply.send({ ok: true, products: [p1.id, p2.id] });
  });
}
