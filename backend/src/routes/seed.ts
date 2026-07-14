/**
 * Seed routes - admin-only endpoint to populate a fresh instance with demo data.
 *
 * Creates a sample team, project, columns, sprints, tasks, and users so the app
 * is ready to demo immediately after installation. Requires isAdmin access.
 * Should be disabled or removed in production deployments where real data exists.
 */
import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../db/client';
import { requireAdmin } from '../middleware/auth';

type TaskInput = Omit<Prisma.TaskUncheckedCreateInput, 'productId' | 'createdBy'>;

export async function seedRoutes(app: FastifyInstance) {
  app.post('/api/seed-examples', { preHandler: requireAdmin }, async (req, reply) => {
    const userId = req.user.userId;

    // Create a second demo user with a random unguessable password (never revealed)
    let demoUser = await prisma.user.findUnique({ where: { username: 'prof_korolev' } });
    if (!demoUser) {
      const demoPassword = randomBytes(32).toString('hex');
      demoUser = await prisma.user.create({
        data: { username: 'prof_korolev', email: 'wernher.korolev@planly.dev', passwordHash: await bcrypt.hash(demoPassword, 12), realName: 'Prof. Wernher Korolev', avatarEmoji: '🧑‍🔬', emailVerified: true },
      });
    }

    const dep = (dependentId: string, prerequisiteId: string) =>
      prisma.taskDependency.create({ data: { dependentId, prerequisiteId } });

    // ── Product 1: Podcast Launch (small) ─────────────────────────────
    const team1 = await prisma.team.create({
      data: { name: 'Podcast Team', members: { create: [{ userId }, { userId: demoUser.id }] } },
    });
    const p1deadline = new Date(); p1deadline.setDate(p1deadline.getDate() + 14);
    const p1 = await prisma.product.create({
      data: { name: 'Podcast Launch', emoji: '🎙️', description: 'Launch a weekly tech podcast covering AI and software engineering.', deadline: p1deadline, teamId: team1.id, ownerId: userId },
    });

    const t1 = (data: TaskInput) =>
      prisma.task.create({ data: { ...data, productId: p1.id, createdBy: userId } });

    const s1 = await t1({ name: 'Define niche & format',      status: 'done',        ownerId: userId,      color: '#7c3aed', completedAt: new Date(), completedBy: userId });
    const s2 = await t1({ name: 'Record pilot episode',        status: 'done',        ownerId: userId,      color: '#7c3aed', completedAt: new Date(), completedBy: userId });
    const s3 = await t1({ name: 'Design cover art',            status: 'in_progress', ownerId: demoUser.id, color: '#3b82f6' });
    const s4 = await t1({ name: 'Set up RSS feed & hosting',   status: 'todo',        ownerId: userId,      color: '#10b981' });
    const s5 = await t1({ name: 'Write episode template',      status: 'todo',        ownerId: demoUser.id, color: '#10b981' });
    const s6 = await t1({ name: 'Submit to Spotify & Apple',   status: 'backlog',     color: '#f59e0b' });
    const s7 = await t1({ name: 'Launch social media page',    status: 'backlog',     ownerId: demoUser.id, color: '#f59e0b' });

    const sm1deadline = new Date(); sm1deadline.setDate(sm1deadline.getDate() + 14);
    const sm1 = await t1({ name: 'Episode 1 Live', status: 'backlog', ownerId: userId, deadline: sm1deadline, color: '#f59e0b' });

    await prisma.subtask.createMany({ data: [
      { taskId: s3.id, name: 'Sketch concepts', completed: true,  order: 0 },
      { taskId: s3.id, name: 'Final design in Figma', completed: false, order: 1 },
      { taskId: s4.id, name: 'Choose hosting provider', completed: true, order: 0 },
      { taskId: s4.id, name: 'Configure RSS metadata', completed: false, order: 1 },
    ]});

    await dep(s2.id, s1.id);
    await dep(s3.id, s1.id);
    await dep(s4.id, s2.id);
    await dep(s5.id, s2.id);
    await dep(s6.id, s4.id); await dep(s6.id, s3.id);
    await dep(s7.id, s3.id);
    await dep(sm1.id, s5.id); await dep(sm1.id, s6.id); await dep(sm1.id, s7.id);

    await prisma.productConnection.create({ data: { productId: p1.id, taskId: sm1.id } });

    // ── Product 2: IRB PD Model (huge) ────────────────────────────────
    const team2 = await prisma.team.create({
      data: { name: 'Credit Risk Team', members: { create: [{ userId }, { userId: demoUser.id }] } },
    });
    const p2deadline = new Date(); p2deadline.setDate(p2deadline.getDate() + 365);
    const p2 = await prisma.product.create({
      data: { name: 'IRB PD Model', emoji: '🏦', description: 'Probability of default model for Danish retail customers, compliant with EBA GL 2017/07 and Finanstilsynet IRB requirements.', deadline: p2deadline, teamId: team2.id, ownerId: userId },
    });

    const t2 = (data: TaskInput) =>
      prisma.task.create({ data: { ...data, productId: p2.id, createdBy: userId } });

    // Phase 1 - Governance & Scope (done)
    const b1  = await t2({ name: 'Define model scope & governance',        status: 'done',        ownerId: userId,      color: '#7c3aed', completedAt: new Date(), completedBy: userId });
    const b2  = await t2({ name: 'Data inventory & gap analysis',           status: 'done',        ownerId: demoUser.id, color: '#7c3aed', completedAt: new Date(), completedBy: userId });
    const b3  = await t2({ name: 'Regulatory requirements mapping (CRR)',   status: 'done',        ownerId: userId,      color: '#7c3aed', completedAt: new Date(), completedBy: userId });

    // Phase 2 - Data (in progress / todo)
    const b4  = await t2({ name: 'Extract data from core banking system',   status: 'in_progress', ownerId: userId,      color: '#3b82f6' });
    const b5  = await t2({ name: 'Extract external credit bureau data',     status: 'in_progress', ownerId: demoUser.id, color: '#3b82f6' });
    const b6  = await t2({ name: 'Data quality assessment & remediation',   status: 'todo',        ownerId: userId,      color: '#3b82f6' });
    const b7  = await t2({ name: 'Define development & validation samples', status: 'todo',        ownerId: demoUser.id, color: '#3b82f6' });

    // Phase 3 - Feature Engineering
    const b8  = await t2({ name: 'Exploratory data analysis',               status: 'todo',        ownerId: userId,      color: '#10b981' });
    const b9  = await t2({ name: 'Feature engineering & transformations',   status: 'backlog',     ownerId: demoUser.id, color: '#10b981' });
    const b10 = await t2({ name: 'Variable selection (Gini / IV analysis)', status: 'backlog',     ownerId: userId,      color: '#10b981' });

    // Phase 4 - Model Development
    const b11 = await t2({ name: 'Baseline logistic regression model',      status: 'backlog',     ownerId: userId,      color: '#10b981' });
    const b12 = await t2({ name: 'ML challenger model (gradient boosting)', status: 'backlog',     ownerId: demoUser.id, color: '#10b981' });
    const b13 = await t2({ name: 'Through-the-cycle (TTC) calibration',     status: 'backlog',     ownerId: userId,      color: '#10b981' });
    const b14 = await t2({ name: 'Conservative margin of conservatism',     status: 'backlog',     ownerId: demoUser.id, color: '#10b981' });
    const b15 = await t2({ name: 'Final model selection & tech doc',        status: 'backlog',     ownerId: userId,      color: '#10b981' });

    // Phase 5 - IRB Compliance
    const b16 = await t2({ name: 'EBA GL 2017/07 compliance checklist',     status: 'backlog',     ownerId: demoUser.id, color: '#f59e0b' });
    const b17 = await t2({ name: 'Finanstilsynet IRB requirements gap',     status: 'backlog',     ownerId: userId,      color: '#f59e0b' });
    const b18 = await t2({ name: 'MRM framework alignment',                 status: 'backlog',     ownerId: demoUser.id, color: '#f59e0b' });
    const b19 = await t2({ name: 'Downturn PD estimation',                  status: 'backlog',     ownerId: userId,      color: '#f59e0b' });
    const b20 = await t2({ name: 'Regulatory documentation package',        status: 'backlog',     ownerId: demoUser.id, color: '#f59e0b' });

    // Phase 6 - Independent Validation
    const b21 = await t2({ name: 'Discriminatory power testing (ROC/Gini)', status: 'backlog',     ownerId: demoUser.id, color: '#ef4444' });
    const b22 = await t2({ name: 'Calibration & backtesting',               status: 'backlog',     ownerId: userId,      color: '#ef4444' });
    const b23 = await t2({ name: 'Benchmarking vs external rating agencies',status: 'backlog',     ownerId: demoUser.id, color: '#ef4444' });
    const b24 = await t2({ name: 'Stress testing under adverse scenarios',  status: 'backlog',     ownerId: userId,      color: '#ef4444' });
    const b25 = await t2({ name: 'Independent model validation report',     status: 'backlog',     ownerId: demoUser.id, color: '#ef4444' });

    // Phase 7 - Regulatory Approval
    const b26 = await t2({ name: 'Internal model committee approval',       status: 'backlog',     ownerId: userId,      color: '#8b5cf6' });
    const b27 = await t2({ name: 'Finanstilsynet submission package',       status: 'backlog',     ownerId: demoUser.id, color: '#8b5cf6' });
    const b28 = await t2({ name: 'Regulatory Q&A & remediation',            status: 'backlog',     ownerId: userId,      color: '#8b5cf6' });

    // Phase 8 - IT Implementation
    const b29 = await t2({ name: 'Scoring pipeline development',            status: 'backlog',     ownerId: demoUser.id, color: '#06b6d4' });
    const b30 = await t2({ name: 'Core banking system integration',         status: 'backlog',     ownerId: userId,      color: '#06b6d4' });
    const b31 = await t2({ name: 'UAT & parallel run vs. existing model',   status: 'backlog',     ownerId: demoUser.id, color: '#06b6d4' });
    const b32 = await t2({ name: 'Production deployment',                   status: 'backlog',     ownerId: userId,      color: '#06b6d4' });

    // Phase 9 - Monitoring
    const b33 = await t2({ name: 'Monitoring framework design',             status: 'backlog',     ownerId: demoUser.id, color: '#10b981' });
    const b34 = await t2({ name: 'Automated PSI & Gini reporting',          status: 'backlog',     ownerId: userId,      color: '#10b981' });
    const b35 = await t2({ name: 'Annual review & recalibration process',   status: 'backlog',     ownerId: demoUser.id, color: '#10b981' });

    // Milestones
    const d60  = new Date(); d60.setDate(d60.getDate() + 60);
    const d120 = new Date(); d120.setDate(d120.getDate() + 120);
    const d150 = new Date(); d150.setDate(d150.getDate() + 150);
    const d200 = new Date(); d200.setDate(d200.getDate() + 200);
    const d270 = new Date(); d270.setDate(d270.getDate() + 270);
    const d300 = new Date(); d300.setDate(d300.getDate() + 300);
    const d365 = new Date(); d365.setDate(d365.getDate() + 365);

    const bm1 = await t2({ name: 'Data Ready for Modeling',      status: 'in_progress', ownerId: userId,      deadline: d60,  color: '#f59e0b' });
    const bm2 = await t2({ name: 'Model Development Complete',   status: 'backlog',     ownerId: userId,      deadline: d120, color: '#f59e0b' });
    const bm3 = await t2({ name: 'IRB Documentation Package',    status: 'backlog',     ownerId: demoUser.id, deadline: d150, color: '#f59e0b' });
    const bm4 = await t2({ name: 'Validation Complete',          status: 'backlog',     ownerId: demoUser.id, deadline: d200, color: '#f59e0b' });
    const bm5 = await t2({ name: 'Regulatory Approval',          status: 'backlog',     ownerId: userId,      deadline: d270, color: '#f59e0b' });
    const bm6 = await t2({ name: 'Production Go-Live',           status: 'backlog',     ownerId: userId,      deadline: d300, color: '#f59e0b' });
    const bm7 = await t2({ name: 'Monitoring Operational',       status: 'backlog',     ownerId: demoUser.id, deadline: d365, color: '#f59e0b' });

    await prisma.subtask.createMany({ data: [
      { taskId: b6.id,  name: 'Check missing value rates',          completed: false, order: 0 },
      { taskId: b6.id,  name: 'Resolve duplicates & outliers',      completed: false, order: 1 },
      { taskId: b6.id,  name: 'Sign-off from data steward',         completed: false, order: 2 },
      { taskId: b10.id, name: 'Univariate screening',               completed: false, order: 0 },
      { taskId: b10.id, name: 'Multicollinearity check (VIF)',       completed: false, order: 1 },
      { taskId: b10.id, name: 'Expert judgement override log',       completed: false, order: 2 },
      { taskId: b25.id, name: 'Draft report',                        completed: false, order: 0 },
      { taskId: b25.id, name: 'Review by CRO',                       completed: false, order: 1 },
      { taskId: b25.id, name: 'Final sign-off',                      completed: false, order: 2 },
    ]});

    // Phase 1 - Governance feeds data phase
    await dep(b4.id, b1.id); await dep(b4.id, b2.id);
    await dep(b5.id, b2.id);
    await dep(b6.id, b4.id); await dep(b6.id, b5.id);
    await dep(b7.id, b6.id);

    // Milestone: Data Ready
    await dep(bm1.id, b7.id);

    // Phase 3 - Feature engineering
    await dep(b8.id,  bm1.id);
    await dep(b9.id,  b8.id);
    await dep(b10.id, b9.id);

    // Phase 4 - Model development
    await dep(b11.id, b10.id);
    await dep(b12.id, b10.id);
    await dep(b13.id, b11.id);
    await dep(b14.id, b13.id);
    await dep(b15.id, b11.id); await dep(b15.id, b12.id); await dep(b15.id, b14.id);

    // Milestone: Model Development Complete
    await dep(bm2.id, b15.id);

    // Phase 5 - IRB Compliance (runs partly in parallel with model dev)
    await dep(b16.id, b3.id);
    await dep(b17.id, b16.id);
    await dep(b18.id, b17.id); await dep(b18.id, bm2.id);
    await dep(b19.id, b14.id);
    await dep(b20.id, b18.id); await dep(b20.id, b19.id);

    // Milestone: IRB Documentation Package
    await dep(bm3.id, b20.id);

    // Phase 6 - Independent Validation
    await dep(b21.id, bm2.id);
    await dep(b22.id, b21.id);
    await dep(b23.id, b21.id);
    await dep(b24.id, b22.id);
    await dep(b25.id, b22.id); await dep(b25.id, b23.id); await dep(b25.id, b24.id);

    // Milestone: Validation Complete
    await dep(bm4.id, b25.id); await dep(bm4.id, bm3.id);

    // Phase 7 - Regulatory Approval
    await dep(b26.id, bm4.id);
    await dep(b27.id, b26.id);
    await dep(b28.id, b27.id);

    // Milestone: Regulatory Approval
    await dep(bm5.id, b28.id);

    // Phase 8 - IT (scoring pipeline starts after model complete)
    await dep(b29.id, bm2.id);
    await dep(b30.id, b29.id);
    await dep(b31.id, b30.id); await dep(b31.id, bm5.id);
    await dep(b32.id, b31.id);

    // Milestone: Production Go-Live
    await dep(bm6.id, b32.id);

    // Phase 9 - Monitoring
    await dep(b33.id, bm6.id);
    await dep(b34.id, b33.id);
    await dep(b35.id, b34.id);

    // Milestone: Monitoring Operational
    await dep(bm7.id, b35.id);

    // Connect final milestone to the product node
    await prisma.productConnection.create({ data: { productId: p2.id, taskId: bm7.id } });

    // ── Product 3: Rocket Build (fun demo) ───────────────────────────
    const team3 = await prisma.team.create({
      data: { name: 'Rocket Team', members: { create: [{ userId }, { userId: demoUser.id }] } },
    });
    const p3deadline = new Date(); p3deadline.setDate(p3deadline.getDate() + 180);
    const p3 = await prisma.product.create({
      data: { name: 'Build a Rocket', emoji: '🚀', description: 'Design, build, and launch a single-stage rocket. From concept to launch in 180 days.', deadline: p3deadline, teamId: team3.id, ownerId: userId },
    });

    const t3 = (data: TaskInput & { canvasX?: number; canvasY?: number }) =>
      prisma.task.create({ data: { ...data, productId: p3.id, createdBy: userId } });

    // Phase 1 - Concept & Design (done) ── purple
    const r1  = await t3({ name: 'Define mission objectives',     status: 'done',        ownerId: userId,      color: '#7c3aed', completedAt: new Date(), completedBy: userId, canvasX:  80, canvasY: 250 });
    const r2  = await t3({ name: 'Payload requirements',          status: 'done',        ownerId: demoUser.id, color: '#7c3aed', completedAt: new Date(), completedBy: userId, canvasX:  80, canvasY: 400 });
    const r3  = await t3({ name: 'Trajectory simulation',         status: 'done',        ownerId: userId,      color: '#7c3aed', completedAt: new Date(), completedBy: userId, canvasX:  80, canvasY: 550 });
    const r4  = await t3({ name: 'Design review & sign-off',      status: 'done',        ownerId: userId,      color: '#7c3aed', completedAt: new Date(), completedBy: userId, canvasX: 260, canvasY: 400 });

    // Phase 2 - Propulsion (in_progress / todo) ── red
    const r5  = await t3({ name: 'Engine specification',          status: 'in_progress', ownerId: userId,      color: '#ef4444', canvasX: 580, canvasY: 150 });
    const r6  = await t3({ name: 'Fuel system design',            status: 'in_progress', ownerId: demoUser.id, color: '#ef4444', canvasX: 580, canvasY: 300 });
    const r7  = await t3({ name: 'Thrust chamber fabrication',    status: 'todo',        ownerId: userId,      color: '#ef4444', canvasX: 740, canvasY: 150 });
    const r8  = await t3({ name: 'Static fire test',              status: 'todo',        ownerId: userId,      color: '#ef4444', canvasX: 740, canvasY: 300 });

    // Phase 3 - Structural Engineering (todo) ── blue
    const r9  = await t3({ name: 'Airframe design',               status: 'todo',        ownerId: demoUser.id, color: '#3b82f6', canvasX: 580, canvasY: 470 });
    const r10 = await t3({ name: 'Material selection',            status: 'todo',        ownerId: userId,      color: '#3b82f6', canvasX: 580, canvasY: 620 });
    const r11 = await t3({ name: 'Nose cone fabrication',         status: 'backlog',     ownerId: demoUser.id, color: '#3b82f6', canvasX: 740, canvasY: 470 });
    const r12 = await t3({ name: 'Fin & interstage assembly',     status: 'backlog',     ownerId: userId,      color: '#3b82f6', canvasX: 740, canvasY: 620 });

    // Milestones: Engine Test & Structural Complete ── amber
    const rd60 = new Date(); rd60.setDate(rd60.getDate() + 60);
    const rd80 = new Date(); rd80.setDate(rd80.getDate() + 80);
    const rm2 = await t3({ name: 'Engine Test Complete',          status: 'backlog',     ownerId: userId,      color: '#f59e0b', deadline: rd60, canvasX: 900, canvasY: 225 });
    const rm3 = await t3({ name: 'Structural Complete',           status: 'backlog',     ownerId: demoUser.id, color: '#f59e0b', deadline: rd80, canvasX: 900, canvasY: 545 });

    // Phase 4 - Avionics & Software (backlog) ── green
    const r13 = await t3({ name: 'Flight computer design',        status: 'backlog',     ownerId: userId,      color: '#10b981', canvasX: 1060, canvasY: 100 });
    const r14 = await t3({ name: 'Navigation & GPS integration',  status: 'backlog',     ownerId: demoUser.id, color: '#10b981', canvasX: 1060, canvasY: 250 });
    const r15 = await t3({ name: 'Telemetry system',              status: 'backlog',     ownerId: userId,      color: '#10b981', canvasX: 1060, canvasY: 400 });
    const r16 = await t3({ name: 'Flight software',               status: 'backlog',     ownerId: demoUser.id, color: '#10b981', canvasX: 1220, canvasY: 250 });

    // Phase 5 - Ground Systems (backlog) ── amber
    const r17 = await t3({ name: 'Launch pad design',             status: 'backlog',     ownerId: userId,      color: '#f59e0b', canvasX: 1060, canvasY: 580 });
    const r18 = await t3({ name: 'Fuel loading system',           status: 'backlog',     ownerId: demoUser.id, color: '#f59e0b', canvasX: 1060, canvasY: 730 });
    const r19 = await t3({ name: 'Range safety system',           status: 'backlog',     ownerId: userId,      color: '#f59e0b', canvasX: 1220, canvasY: 650 });

    // Milestone: Systems Integration
    const rd120 = new Date(); rd120.setDate(rd120.getDate() + 120);
    const rm4 = await t3({ name: 'Systems Integration Complete',  status: 'backlog',     ownerId: userId,      color: '#f59e0b', deadline: rd120, canvasX: 1380, canvasY: 400 });

    // Phase 6 - Testing (backlog) ── cyan
    const r20 = await t3({ name: 'Component integration',         status: 'backlog',     ownerId: userId,      color: '#06b6d4', canvasX: 1540, canvasY: 200 });
    const r21 = await t3({ name: 'Vibration & acoustic testing',  status: 'backlog',     ownerId: demoUser.id, color: '#06b6d4', canvasX: 1540, canvasY: 380 });
    const r22 = await t3({ name: 'Full systems test',             status: 'backlog',     ownerId: userId,      color: '#06b6d4', canvasX: 1700, canvasY: 280 });
    const r23 = await t3({ name: 'Launch rehearsal',              status: 'backlog',     ownerId: demoUser.id, color: '#06b6d4', canvasX: 1700, canvasY: 480 });

    // Final milestones
    const rd160 = new Date(); rd160.setDate(rd160.getDate() + 160);
    const rd180 = new Date(); rd180.setDate(rd180.getDate() + 180);
    const rm5 = await t3({ name: 'Launch Ready',                  status: 'backlog',     ownerId: userId,      color: '#f59e0b', deadline: rd160, canvasX: 1860, canvasY: 380 });
    const rm6 = await t3({ name: '🚀 Launch Day!',                status: 'backlog',     ownerId: userId,      color: '#f59e0b', deadline: rd180, canvasX: 2020, canvasY: 380 });

    // Design Freeze milestone (placed between phase 1 and rest)
    const rd20 = new Date(); rd20.setDate(rd20.getDate() + 20);
    const rm1 = await t3({ name: 'Design Freeze',                 status: 'in_progress', ownerId: userId,      color: '#f59e0b', deadline: rd20, canvasX: 420, canvasY: 400 });

    await prisma.subtask.createMany({ data: [
      { taskId: r3.id,  name: 'Calculate orbit & delta-v budget',  completed: true,  order: 0 },
      { taskId: r3.id,  name: 'Re-entry heating analysis',         completed: true,  order: 1 },
      { taskId: r3.id,  name: 'Apogee & recovery zone mapping',    completed: true,  order: 2 },
      { taskId: r7.id,  name: 'Machine combustion chamber',        completed: false, order: 0 },
      { taskId: r7.id,  name: 'Injector plate design',             completed: false, order: 1 },
      { taskId: r7.id,  name: 'Nozzle fabrication',                completed: false, order: 2 },
      { taskId: r22.id, name: 'Go/No-go systems checklist',        completed: false, order: 0 },
      { taskId: r22.id, name: 'Countdown simulation',              completed: false, order: 1 },
      { taskId: r22.id, name: 'Post-test inspection & sign-off',   completed: false, order: 2 },
    ]});

    // Phase 1 internal deps
    await dep(r2.id, r1.id); await dep(r3.id, r1.id);
    await dep(r4.id, r2.id); await dep(r4.id, r3.id);

    // Design Freeze gates everything
    await dep(rm1.id, r4.id);
    await dep(r5.id,  rm1.id); await dep(r6.id,  rm1.id);
    await dep(r9.id,  rm1.id); await dep(r10.id, rm1.id);
    await dep(r13.id, rm1.id); await dep(r14.id, rm1.id); await dep(r15.id, rm1.id);
    await dep(r17.id, rm1.id);

    // Phase 2 - Propulsion
    await dep(r7.id, r5.id); await dep(r7.id, r6.id);
    await dep(r8.id, r7.id);
    await dep(rm2.id, r8.id);

    // Phase 3 - Structural
    await dep(r11.id, r9.id); await dep(r11.id, r10.id);
    await dep(r12.id, r11.id);
    await dep(rm3.id, r12.id);

    // Phase 4 - Avionics
    await dep(r16.id, r13.id); await dep(r16.id, r14.id);

    // Phase 5 - Ground systems
    await dep(r18.id, r17.id);
    await dep(r19.id, r17.id);

    // Systems Integration needs propulsion, structural, and avionics done
    await dep(rm4.id, rm2.id); await dep(rm4.id, rm3.id);
    await dep(rm4.id, r16.id); await dep(rm4.id, r15.id);
    await dep(rm4.id, r18.id); await dep(rm4.id, r19.id);

    // Phase 6 - Testing
    await dep(r20.id, rm4.id);
    await dep(r21.id, r20.id);
    await dep(r22.id, r21.id);
    await dep(r23.id, r22.id);

    // Final milestones
    await dep(rm5.id, r23.id);
    await dep(rm6.id, rm5.id);

    await prisma.productConnection.create({ data: { productId: p3.id, taskId: rm6.id } });

    reply.send({ ok: true, products: [p1.id, p2.id, p3.id] });
  });
}
