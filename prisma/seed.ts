import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

import { Prisma, Role, PaymentKind, QuoteStatus, ApprovalStatus } from "@prisma/client";

async function main() {
  // 1. Ensure Org exists
  const org = (await prisma.org.findFirst()) ??
    (await prisma.org.create({ data: { name: "CanyonAI" } }));
  console.log("Using Org id", org.id);

    // 2. Locate an existing user to act as the creator / approver for all seeded data
  const existingUser = await prisma.user.findFirst();
  if (!existingUser) {
    throw new Error(
      "No users found in the database. Please create a user (e.g. via your auth flow) before seeding quotes."
    );
  }
  console.log("Using User id", existingUser.id);

  // 3. Seed Packages
  const packages = [
    {
      id: "pkg_standard",
      name: "Standard SaaS Suite",
      description: "Core features, basic e-mail support",
    },
    {
      id: "pkg_premium",
      name: "Premium Analytics Bundle",
      description: "Advanced analytics + priority support",
    },
    {
      id: "pkg_enterprise",
      name: "Enterprise Platform Pack",
      description: "All features, dedicated CSM, 99.9 % SLA",
    },
  ];
  for (const p of packages) {
    await prisma.package.upsert({
      where: { id: p.id },
      create: { ...p, orgId: org.id },
      update: {},
    });
  }

  // Helper to fetch package ref
  const pkgMap = Object.fromEntries(
    (await prisma.package.findMany({ where: { orgId: org.id } })).map((p) => [p.id, p])
  );

  // 4. Seed Quotes + ApprovalWorkflows + Steps
  const quotes = [
    {
      id: "quote_001",
      createdById: "user_ae_1",
      packageId: "pkg_standard",
      quantity: 10,
      customerName: "Acme Co",
      paymentKind: PaymentKind.NET,
      netDays: 30,
      prepayPercent: null,
      subtotal: new Prisma.Decimal("10000.00"),
      discountPercent: new Prisma.Decimal("0"),
      total: new Prisma.Decimal("10000.00"),
      status: QuoteStatus.Pending,
      createdAt: new Date("2025-07-30T00:00:00Z"),
    },
    {
      id: "quote_002",
      createdById: "user_ae_2",
      packageId: "pkg_premium",
      quantity: 50,
      customerName: "BetaCorp",
      paymentKind: PaymentKind.NET,
      netDays: 45,
      prepayPercent: null,
      subtotal: new Prisma.Decimal("50000.00"),
      discountPercent: new Prisma.Decimal("10"),
      total: new Prisma.Decimal("45000.00"),
      status: QuoteStatus.Pending,
      createdAt: new Date("2025-07-30T00:05:00Z"),
    },
    {
      id: "quote_003",
      createdById: "user_ae_3",
      packageId: "pkg_enterprise",
      quantity: 200,
      customerName: "Gamma Global",
      paymentKind: PaymentKind.NET,
      netDays: 60,
      prepayPercent: null,
      subtotal: new Prisma.Decimal("300000.00"),
      discountPercent: new Prisma.Decimal("25"),
      total: new Prisma.Decimal("225000.00"),
      status: QuoteStatus.Pending,
      createdAt: new Date("2025-07-30T00:10:00Z"),
    },
    {
      id: "quote_004",
      createdById: "user_ae_1",
      packageId: "pkg_standard",
      quantity: 5,
      customerName: "Delta Labs",
      paymentKind: PaymentKind.PREPAY,
      netDays: null,
      prepayPercent: new Prisma.Decimal("100.0"),
      subtotal: new Prisma.Decimal("5000.00"),
      discountPercent: new Prisma.Decimal("0"),
      total: new Prisma.Decimal("5000.00"),
      status: QuoteStatus.Approved,
      createdAt: new Date("2025-07-30T00:15:00Z"),
    },
    {
      id: "quote_005",
      createdById: "user_ae_2",
      packageId: "pkg_premium",
      quantity: 100,
      customerName: "Epsilon Ltd",
      paymentKind: PaymentKind.BOTH,
      netDays: 60,
      prepayPercent: new Prisma.Decimal("50.0"),
      subtotal: new Prisma.Decimal("120000.00"),
      discountPercent: new Prisma.Decimal("15"),
      total: new Prisma.Decimal("102000.00"),
      status: QuoteStatus.Pending,
      createdAt: new Date("2025-07-30T00:20:00Z"),
    },
  ];

  for (const q of quotes) {
    await prisma.quote.upsert({
      where: { id: q.id },
      create: {
        id: q.id,
        orgId: org.id,
        createdById: existingUser.id,
        packageId: q.packageId,
        quantity: q.quantity,
        customerName: q.customerName,
        paymentKind: q.paymentKind,
        netDays: q.netDays,
        prepayPercent: q.prepayPercent,
        subtotal: q.subtotal,
        discountPercent: q.discountPercent,
        total: q.total,
        status: q.status,
        createdAt: q.createdAt,
      },
      update: {},
    });

    // Create ApprovalWorkflow and steps
    const awfId = `awf_${q.id.split("_")[1]}`;
    await prisma.approvalWorkflow.upsert({
      where: { id: awfId },
      create: {
        id: awfId,
        quoteId: q.id,
      },
      update: {},
    });
  }

  // Seed ApprovalSteps
  const steps = [
    // Quote 1
    { id: "step_001_1", awf: "awf_001", stepOrder: 1, persona: Role.AE, approverId: "user_ae_1", status: ApprovalStatus.Approved, approvedAt: new Date("2025-07-30T00:02:00Z") },
    { id: "step_001_2", awf: "awf_001", stepOrder: 2, persona: Role.DEALDESK, approverId: "user_dealdesk1", status: ApprovalStatus.Approved, approvedAt: new Date("2025-07-30T00:03:00Z") },
    { id: "step_001_3", awf: "awf_001", stepOrder: 3, persona: Role.CRO, approverId: null, status: ApprovalStatus.Skipped, approvedAt: null },
    { id: "step_001_4", awf: "awf_001", stepOrder: 4, persona: Role.LEGAL, approverId: "user_legal1", status: ApprovalStatus.Approved, approvedAt: new Date("2025-07-30T00:04:00Z") },
    { id: "step_001_5", awf: "awf_001", stepOrder: 5, persona: Role.FINANCE, approverId: null, status: ApprovalStatus.Skipped, approvedAt: null },
    // Quote 2
    { id: "step_002_1", awf: "awf_002", stepOrder: 1, persona: Role.AE, approverId: "user_ae_2", status: ApprovalStatus.Approved, approvedAt: new Date("2025-07-30T00:06:00Z") },
    { id: "step_002_2", awf: "awf_002", stepOrder: 2, persona: Role.DEALDESK, approverId: "user_dealdesk2", status: ApprovalStatus.Approved, approvedAt: new Date("2025-07-30T00:07:00Z") },
    { id: "step_002_3", awf: "awf_002", stepOrder: 3, persona: Role.CRO, approverId: null, status: ApprovalStatus.Skipped, approvedAt: null },
    { id: "step_002_4", awf: "awf_002", stepOrder: 4, persona: Role.LEGAL, approverId: "user_legal1", status: ApprovalStatus.Pending, approvedAt: null },
    { id: "step_002_5", awf: "awf_002", stepOrder: 5, persona: Role.FINANCE, approverId: null, status: ApprovalStatus.Skipped, approvedAt: null },
    // Quote 3
    { id: "step_003_1", awf: "awf_003", stepOrder: 1, persona: Role.AE, approverId: "user_ae_3", status: ApprovalStatus.Approved, approvedAt: new Date("2025-07-30T00:11:00Z") },
    { id: "step_003_2", awf: "awf_003", stepOrder: 2, persona: Role.DEALDESK, approverId: "user_dealdesk3", status: ApprovalStatus.Approved, approvedAt: new Date("2025-07-30T00:12:00Z") },
    { id: "step_003_3", awf: "awf_003", stepOrder: 3, persona: Role.CRO, approverId: "user_cro1", status: ApprovalStatus.Pending, approvedAt: null },
    { id: "step_003_4", awf: "awf_003", stepOrder: 4, persona: Role.LEGAL, approverId: "user_legal2", status: ApprovalStatus.Pending, approvedAt: null },
    { id: "step_003_5", awf: "awf_003", stepOrder: 5, persona: Role.FINANCE, approverId: "user_finance1", status: ApprovalStatus.Pending, approvedAt: null },
    // Quote 4
    { id: "step_004_1", awf: "awf_004", stepOrder: 1, persona: Role.AE, approverId: "user_ae_1", status: ApprovalStatus.Approved, approvedAt: new Date("2025-07-30T00:16:00Z") },
    { id: "step_004_2", awf: "awf_004", stepOrder: 2, persona: Role.DEALDESK, approverId: null, status: ApprovalStatus.Skipped, approvedAt: null },
    { id: "step_004_3", awf: "awf_004", stepOrder: 3, persona: Role.CRO, approverId: null, status: ApprovalStatus.Skipped, approvedAt: null },
    { id: "step_004_4", awf: "awf_004", stepOrder: 4, persona: Role.LEGAL, approverId: "user_legal1", status: ApprovalStatus.Approved, approvedAt: new Date("2025-07-30T00:17:30Z") },
    { id: "step_004_5", awf: "awf_004", stepOrder: 5, persona: Role.FINANCE, approverId: null, status: ApprovalStatus.Skipped, approvedAt: null },
    // Quote 5
    { id: "step_005_1", awf: "awf_005", stepOrder: 1, persona: Role.AE, approverId: "user_ae_2", status: ApprovalStatus.Approved, approvedAt: new Date("2025-07-30T00:21:00Z") },
    { id: "step_005_2", awf: "awf_005", stepOrder: 2, persona: Role.DEALDESK, approverId: "user_dealdesk2", status: ApprovalStatus.Approved, approvedAt: new Date("2025-07-30T00:22:00Z") },
    { id: "step_005_3", awf: "awf_005", stepOrder: 3, persona: Role.CRO, approverId: null, status: ApprovalStatus.Skipped, approvedAt: null },
    { id: "step_005_4", awf: "awf_005", stepOrder: 4, persona: Role.LEGAL, approverId: "user_legal2", status: ApprovalStatus.Pending, approvedAt: null },
    { id: "step_005_5", awf: "awf_005", stepOrder: 5, persona: Role.FINANCE, approverId: "user_finance1", status: ApprovalStatus.Pending, approvedAt: null },
  ];

  for (const s of steps) {
    await prisma.approvalStep.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        approvalWorkflowId: s.awf,
        stepOrder: s.stepOrder,
        persona: s.persona,
        approverId: s.approverId ? existingUser.id : undefined,
        status: s.status,
        approvedAt: s.approvedAt ?? undefined,
      },
      update: {},
    });
  }

  console.log("Mock data seeded ✔️");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
