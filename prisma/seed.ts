import { PrismaClient, Prisma, Role, PaymentKind, QuoteStatus, ApprovalStatus } from "@prisma/client";

const prisma = new PrismaClient();

type QuoteScenario = {
  id: string;
  packageId: string;
  quantity: number;
  customerName: string;
  paymentKind: PaymentKind;
  netDays: number | null;
  prepayPercent: Prisma.Decimal | null;
  discountPercent: Prisma.Decimal; // percentage, e.g., 15 means 15%
  addOnIds: string[];
  status: QuoteStatus;
  createdAt: Date;
};

function decimal(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function minutesAfter(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

async function main() {
  // Org and user
  const org = (await prisma.org.findFirst()) ?? (await prisma.org.create({ data: { name: "Zoom Demo" } }));
  const existingUser = await prisma.user.findFirst();
  if (!existingUser) {
    throw new Error("No users found. Please create a user via your auth flow before seeding.");
  }

  // Packages (Zoom-style)
  const pkgData = [
    { id: "pkg_zoom_basic", name: "Zoom Basic (Free)", description: "Personal meetings with time limit", unitPrice: decimal("0.00") },
    { id: "pkg_zoom_pro", name: "Zoom Pro", description: "Small teams, increased time limits", unitPrice: decimal("15.99") },
    { id: "pkg_zoom_business", name: "Zoom Business", description: "SSO and advanced admin", unitPrice: decimal("19.99") },
    { id: "pkg_zoom_enterprise", name: "Zoom Enterprise", description: "Advanced admin and support", unitPrice: decimal("29.99") },
  ];
  for (const p of pkgData) {
    await prisma.package.upsert({ where: { id: p.id }, create: { ...p, orgId: org.id }, update: {} });
  }

  // Add-ons (Zoom-like)
  const addOnData = [
    { id: "addon_large_meetings_500", name: "Large Meetings 500", description: "Increase capacity to 500", unitPrice: decimal("50.00") },
    { id: "addon_large_meetings_1000", name: "Large Meetings 1000", description: "Increase capacity to 1000", unitPrice: decimal("90.00") },
    { id: "addon_webinar_500", name: "Webinar 500", description: "Webinar up to 500 attendees", unitPrice: decimal("40.00") },
    { id: "addon_webinar_1000", name: "Webinar 1000", description: "Webinar up to 1000 attendees", unitPrice: decimal("79.00") },
    { id: "addon_cloud_recording_10gb", name: "Cloud Recording 10GB", description: "Additional 10GB storage", unitPrice: decimal("10.00") },
    { id: "addon_zoom_rooms", name: "Zoom Rooms", description: "Conference room experience", unitPrice: decimal("49.00") },
    { id: "addon_premier_support", name: "Premier Support", description: "Priority support and TAM", unitPrice: decimal("149.00") },
    { id: "addon_whiteboard_plus", name: "Whiteboard Plus", description: "Advanced whiteboard", unitPrice: decimal("7.99") },
    { id: "addon_ai_companion", name: "AI Companion", description: "AI features", unitPrice: decimal("5.00") },
  ];
  for (const a of addOnData) {
    await (prisma as any).addOn.upsert({ where: { id: a.id }, create: { ...a, orgId: org.id }, update: {} });
  }

  const packageById = new Map(pkgData.map((p) => [p.id, p]));
  const addOnById = new Map(addOnData.map((a) => [a.id, a]));

  const baseTime = new Date("2025-08-01T00:00:00Z");
  const q: QuoteScenario[] = [
    { id: "zoom_q001", packageId: "pkg_zoom_basic", quantity: 5, customerName: "Acme Co", paymentKind: PaymentKind.PREPAY, netDays: null, prepayPercent: decimal("100"), discountPercent: decimal("0"), addOnIds: ["addon_large_meetings_500"], status: QuoteStatus.Approved, createdAt: minutesAfter(baseTime, 0) },
    { id: "zoom_q002", packageId: "pkg_zoom_pro", quantity: 10, customerName: "BetaCorp", paymentKind: PaymentKind.NET, netDays: 30, prepayPercent: null, discountPercent: decimal("5"), addOnIds: ["addon_cloud_recording_10gb"], status: QuoteStatus.Pending, createdAt: minutesAfter(baseTime, 5) },
    { id: "zoom_q003", packageId: "pkg_zoom_business", quantity: 50, customerName: "Gamma Global", paymentKind: PaymentKind.NET, netDays: 45, prepayPercent: null, discountPercent: decimal("10"), addOnIds: ["addon_webinar_1000", "addon_cloud_recording_10gb"], status: QuoteStatus.Pending, createdAt: minutesAfter(baseTime, 10) },
    { id: "zoom_q004", packageId: "pkg_zoom_enterprise", quantity: 200, customerName: "Delta Labs", paymentKind: PaymentKind.NET, netDays: 60, prepayPercent: null, discountPercent: decimal("25"), addOnIds: ["addon_large_meetings_1000", "addon_zoom_rooms", "addon_premier_support"], status: QuoteStatus.Pending, createdAt: minutesAfter(baseTime, 15) },
    { id: "zoom_q005", packageId: "pkg_zoom_basic", quantity: 1, customerName: "Epsilon Ltd", paymentKind: PaymentKind.PREPAY, netDays: null, prepayPercent: decimal("100"), discountPercent: decimal("0"), addOnIds: ["addon_ai_companion", "addon_whiteboard_plus"], status: QuoteStatus.Approved, createdAt: minutesAfter(baseTime, 20) },
    { id: "zoom_q006", packageId: "pkg_zoom_pro", quantity: 100, customerName: "Zeta Holdings", paymentKind: PaymentKind.BOTH, netDays: 30, prepayPercent: decimal("50"), discountPercent: decimal("15"), addOnIds: ["addon_large_meetings_500", "addon_webinar_500"], status: QuoteStatus.Pending, createdAt: minutesAfter(baseTime, 25) },
    { id: "zoom_q007", packageId: "pkg_zoom_business", quantity: 30, customerName: "Eta Ventures", paymentKind: PaymentKind.NET, netDays: 30, prepayPercent: null, discountPercent: decimal("20"), addOnIds: ["addon_zoom_rooms"], status: QuoteStatus.Pending, createdAt: minutesAfter(baseTime, 30) },
    { id: "zoom_q008", packageId: "pkg_zoom_enterprise", quantity: 500, customerName: "Theta Org", paymentKind: PaymentKind.BOTH, netDays: 45, prepayPercent: decimal("30"), discountPercent: decimal("40"), addOnIds: ["addon_large_meetings_1000", "addon_webinar_1000", "addon_premier_support", "addon_ai_companion"], status: QuoteStatus.Pending, createdAt: minutesAfter(baseTime, 35) },
    { id: "zoom_q009", packageId: "pkg_zoom_pro", quantity: 5, customerName: "Iota LLC", paymentKind: PaymentKind.NET, netDays: 15, prepayPercent: null, discountPercent: decimal("0"), addOnIds: ["addon_cloud_recording_10gb"], status: QuoteStatus.Approved, createdAt: minutesAfter(baseTime, 40) },
    { id: "zoom_q010", packageId: "pkg_zoom_business", quantity: 120, customerName: "Kappa Systems", paymentKind: PaymentKind.NET, netDays: 45, prepayPercent: null, discountPercent: decimal("12"), addOnIds: ["addon_webinar_1000", "addon_large_meetings_500", "addon_cloud_recording_10gb"], status: QuoteStatus.Pending, createdAt: minutesAfter(baseTime, 45) },
    { id: "zoom_q011", packageId: "pkg_zoom_enterprise", quantity: 100, customerName: "Lambda Tech", paymentKind: PaymentKind.BOTH, netDays: 30, prepayPercent: decimal("70"), discountPercent: decimal("50"), addOnIds: ["addon_zoom_rooms"], status: QuoteStatus.Rejected, createdAt: minutesAfter(baseTime, 50) },
    { id: "zoom_q012", packageId: "pkg_zoom_pro", quantity: 250, customerName: "Mu Media", paymentKind: PaymentKind.NET, netDays: 60, prepayPercent: null, discountPercent: decimal("18"), addOnIds: ["addon_large_meetings_500", "addon_webinar_500", "addon_cloud_recording_10gb", "addon_whiteboard_plus"], status: QuoteStatus.Pending, createdAt: minutesAfter(baseTime, 55) },
    { id: "zoom_q013", packageId: "pkg_zoom_business", quantity: 3, customerName: "Nu Labs", paymentKind: PaymentKind.PREPAY, netDays: null, prepayPercent: decimal("100"), discountPercent: decimal("0"), addOnIds: [], status: QuoteStatus.Approved, createdAt: minutesAfter(baseTime, 60) },
    { id: "zoom_q014", packageId: "pkg_zoom_pro", quantity: 75, customerName: "Xi Health", paymentKind: PaymentKind.NET, netDays: 30, prepayPercent: null, discountPercent: decimal("15"), addOnIds: ["addon_ai_companion"], status: QuoteStatus.Approved, createdAt: minutesAfter(baseTime, 65) },
    { id: "zoom_q015", packageId: "pkg_zoom_enterprise", quantity: 350, customerName: "Omicron Partners", paymentKind: PaymentKind.NET, netDays: 30, prepayPercent: null, discountPercent: decimal("32"), addOnIds: ["addon_webinar_1000", "addon_premier_support", "addon_zoom_rooms"], status: QuoteStatus.Pending, createdAt: minutesAfter(baseTime, 70) },
    { id: "zoom_q016", packageId: "pkg_zoom_business", quantity: 200, customerName: "Pi Services", paymentKind: PaymentKind.BOTH, netDays: 60, prepayPercent: decimal("50"), discountPercent: decimal("42"), addOnIds: ["addon_large_meetings_1000", "addon_webinar_500"], status: QuoteStatus.Pending, createdAt: minutesAfter(baseTime, 75) },
    { id: "zoom_q017", packageId: "pkg_zoom_pro", quantity: 400, customerName: "Rho Retail", paymentKind: PaymentKind.NET, netDays: 45, prepayPercent: null, discountPercent: decimal("10"), addOnIds: ["addon_webinar_500", "addon_ai_companion"], status: QuoteStatus.Pending, createdAt: minutesAfter(baseTime, 80) },
    { id: "zoom_q018", packageId: "pkg_zoom_basic", quantity: 2, customerName: "Sigma Edu", paymentKind: PaymentKind.PREPAY, netDays: null, prepayPercent: decimal("100"), discountPercent: decimal("0"), addOnIds: ["addon_cloud_recording_10gb"], status: QuoteStatus.Approved, createdAt: minutesAfter(baseTime, 85) },
    { id: "zoom_q019", packageId: "pkg_zoom_business", quantity: 60, customerName: "Tau Gaming", paymentKind: PaymentKind.NET, netDays: 30, prepayPercent: null, discountPercent: decimal("14"), addOnIds: ["addon_whiteboard_plus", "addon_webinar_500"], status: QuoteStatus.Pending, createdAt: minutesAfter(baseTime, 90) },
    { id: "zoom_q020", packageId: "pkg_zoom_enterprise", quantity: 50, customerName: "Upsilon Foods", paymentKind: PaymentKind.NET, netDays: 30, prepayPercent: null, discountPercent: decimal("22"), addOnIds: ["addon_large_meetings_500", "addon_cloud_recording_10gb", "addon_ai_companion"], status: QuoteStatus.Approved, createdAt: minutesAfter(baseTime, 95) },
  ];

  function computeFinancials(s: QuoteScenario) {
    const pkg = packageById.get(s.packageId)!;
    const packageUnit = Number(pkg.unitPrice);
    const addOnSum = s.addOnIds.reduce((acc, id) => acc + Number(addOnById.get(id)!.unitPrice), 0);
    const subtotalNum = packageUnit * s.quantity + addOnSum;
    const discountPct = Number(s.discountPercent) / 100;
    const totalNum = subtotalNum * (1 - discountPct);
    // Round to 2 decimals for currency
    return { subtotal: decimal(subtotalNum.toFixed(2)), total: decimal(totalNum.toFixed(2)) };
  }

  function buildApprovalChain(discountPct: Prisma.Decimal, paymentKind: PaymentKind, netDays: number | null): Role[] {
    const roles: Role[] = [Role.AE];
    const discount = new Prisma.Decimal(discountPct);
    const isBespoke = paymentKind === PaymentKind.BOTH || (paymentKind === PaymentKind.NET && (netDays ?? 0) >= 60);
    if (discount.greaterThan(0) && discount.lessThanOrEqualTo(15)) {
      roles.push(Role.DEALDESK);
    } else if (discount.greaterThan(15) && discount.lessThanOrEqualTo(40)) {
      roles.push(Role.CRO);
    } else if (discount.greaterThan(40)) {
      roles.push(Role.CRO, Role.FINANCE);
    }
    if (isBespoke && !roles.includes(Role.FINANCE)) {
      roles.push(Role.FINANCE);
    }
    roles.push(Role.LEGAL);
    return roles;
  }

  for (const s of q) {
    const { subtotal, total } = computeFinancials(s);

    await prisma.quote.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        org: { connect: { id: org.id } },
        createdBy: { connect: { id: existingUser.id } },
        package: { connect: { id: s.packageId } },
        quantity: s.quantity,
        customerName: s.customerName,
        paymentKind: s.paymentKind,
        netDays: s.netDays,
        prepayPercent: s.prepayPercent ?? undefined,
        subtotal,
        discountPercent: s.discountPercent,
        total,
        status: s.status,
        createdAt: s.createdAt,
        addOns: { connect: s.addOnIds.map((id) => ({ id })) },
      },
      update: {
        package: { connect: { id: s.packageId } },
        quantity: s.quantity,
        customerName: s.customerName,
        paymentKind: s.paymentKind,
        netDays: s.netDays,
        prepayPercent: s.prepayPercent ?? undefined,
        subtotal,
        discountPercent: s.discountPercent,
        total,
        status: s.status,
        createdAt: s.createdAt,
        addOns: { set: s.addOnIds.map((id) => ({ id })) },
      },
    });

    const chain = buildApprovalChain(s.discountPercent, s.paymentKind, s.netDays);
    const workflowId = `awf_${s.id}`;
    await prisma.approvalWorkflow.upsert({ where: { id: workflowId }, create: { id: workflowId, quote: { connect: { id: s.id } } }, update: {} });

    // Clean existing steps for idempotency
    const existingSteps = await prisma.approvalStep.findMany({ where: { approvalWorkflowId: workflowId } });
    if (existingSteps.length > 0) {
      await prisma.approvalStep.deleteMany({ where: { approvalWorkflowId: workflowId } });
    }

    // Build step statuses
    const stepBaseTime = minutesAfter(s.createdAt, 1);
    let order = 1;
    for (let i = 0; i < chain.length; i++) {
      const persona = chain[i]!;
      let status: ApprovalStatus = ApprovalStatus.Waiting;
      let approvedAt: Date | null = null;

      if (i === 0) {
        // AE auto-approves as submitter
        status = ApprovalStatus.Approved;
        approvedAt = minutesAfter(stepBaseTime, 1);
      } else if (s.status === QuoteStatus.Approved) {
        // Fully approved quotes: mark all steps approved in sequence
        status = ApprovalStatus.Approved;
        approvedAt = minutesAfter(stepBaseTime, i + 1);
      } else if (s.status === QuoteStatus.Rejected && i === 1) {
        // Second step rejected for rejected scenarios
        status = ApprovalStatus.Rejected;
        approvedAt = minutesAfter(stepBaseTime, i + 1);
      } else if (s.status === QuoteStatus.Pending) {
        // Default waiting for all non-approved steps; first non-approved becomes pending below after create
        status = ApprovalStatus.Waiting;
      }

      await prisma.approvalStep.create({
        data: {
          id: `step_${s.id}_${order}`,
          approvalWorkflowId: workflowId,
          stepOrder: order,
          persona,
          approverId: existingUser.id,
          status,
          approvedAt: approvedAt ?? undefined,
        },
      });

      if (s.status === QuoteStatus.Rejected && i === 1) {
        break; // stop adding further steps after rejection
      }
      order += 1;
    }

    // For pending quotes, ensure gating: first non-approved step should be Pending, others Waiting
    if (s.status === QuoteStatus.Pending) {
      const steps = await prisma.approvalStep.findMany({ where: { approvalWorkflowId: workflowId }, orderBy: { stepOrder: "asc" } });
      const hasRejected = steps.some((st) => st.status === ApprovalStatus.Rejected);
      if (!hasRejected) {
        let firstNonApprovedIndex = steps.findIndex((st) => st.status !== ApprovalStatus.Approved);
        for (let i = 0; i < steps.length; i++) {
          const st = steps[i]!;
          if (st.status === ApprovalStatus.Approved || st.status === ApprovalStatus.Rejected) continue;
          const isFirstNonApproved = i === firstNonApprovedIndex;
          const desired = isFirstNonApproved ? ApprovalStatus.Pending : ApprovalStatus.Waiting;
          if (st.status !== desired) {
            const data: Prisma.ApprovalStepUpdateInput = isFirstNonApproved
              ? { status: desired, updatedAt: minutesAfter(stepBaseTime, i + 1) }
              : { status: desired, updatedAt: null };
            await prisma.approvalStep.update({ where: { id: st.id }, data });
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Coverage quotes: ensure at least one APPROVED quote for every
  // (package × add-on) combination. Add on top of existing scenarios.
  // ---------------------------------------------------------------------------
  const coverageCustomerNames = [
    "Altair Analytics", "Beacon Solutions", "Catalyst Labs", "Delta Ventures", "Evergreen Systems",
    "Fathom Networks", "Granite Partners", "Harbor Dynamics", "Ionix Group", "Juniper Holdings",
    "Keystone Digital", "Lighthouse Media", "Monarch Retail", "Northstar Logistics", "Orchid Health",
    "Pinnacle Security", "Quasar Energy", "Redwood Finance", "Sequoia Ventures", "Titan Industrial",
    "Umbra Technologies", "Vanguard Studios", "Willow Education", "Xenon Robotics", "Yellow Brick Apps",
    "Zephyr Travel", "Aurora Biotech", "Bluebird Telecom", "Copperfield Foods", "Dynamo Fitness",
    "Echo Entertainment", "Forge Manufacturing", "Glacier Insurance", "Horizon Mobility", "Indigo Travel",
    "Jasper Software", "Kite Aerospace", "Lyric Music", "Mosaic Housing", "Nimbus Cloudworks",
    "Opal Financial", "Prairie Agri", "Quartz Mining", "Riverstone Hotels", "Sapphire Sports",
    "Timberline Outdoors", "Uptown Services", "Veridian Pharma", "Wildflower Cosmetics", "Xylem Water",
    "Yukon Shipping", "Zenith Data", "Atlas Robotics", "Bridgepoint Health", "Cobalt Systems",
    "Driftwood Media", "Element Electric", "Frontier Legal", "Garnet Retail", "Helix Bio",
  ];
  let covIndex = 0;
  for (const pkg of pkgData) {
    for (const addon of addOnData) {
      const id = `cov_${pkg.id}_${addon.id}`;
      const quantityCycle = [3, 5, 10, 20, 50, 75, 120];
      const discountCycle = [0, 3, 5, 7, 10, 12, 15];
      const paymentCycle = [PaymentKind.NET, PaymentKind.PREPAY, PaymentKind.BOTH];

      const quantity = quantityCycle[covIndex % quantityCycle.length]!;
      const discountPercent = discountCycle[covIndex % discountCycle.length]!;
      const paymentKind = paymentCycle[covIndex % paymentCycle.length]!;
      const netDaysOptions = [15, 30, 45, 60];
      const prepayOptions = [100, 70, 50];
      const netDays = paymentKind === PaymentKind.NET || paymentKind === PaymentKind.BOTH ? netDaysOptions[covIndex % netDaysOptions.length]! : null;
      const prepayPercent = paymentKind === PaymentKind.PREPAY || paymentKind === PaymentKind.BOTH ? decimal(prepayOptions[covIndex % prepayOptions.length]!) : null;

      const scenario: QuoteScenario = {
        id,
        packageId: pkg.id,
        quantity,
        customerName: coverageCustomerNames[covIndex % coverageCustomerNames.length]!,
        paymentKind,
        netDays: paymentKind === PaymentKind.PREPAY ? null : netDays,
        prepayPercent: paymentKind === PaymentKind.NET ? null : prepayPercent,
        discountPercent: decimal(discountPercent),
        addOnIds: [addon.id],
        status: QuoteStatus.Approved,
        createdAt: minutesAfter(baseTime, 200 + covIndex),
      };

      const { subtotal, total } = computeFinancials(scenario);

      await prisma.quote.upsert({
        where: { id: scenario.id },
        create: {
          id: scenario.id,
          org: { connect: { id: org.id } },
          createdBy: { connect: { id: existingUser.id } },
          package: { connect: { id: scenario.packageId } },
          quantity: scenario.quantity,
          customerName: scenario.customerName,
          paymentKind: scenario.paymentKind,
          netDays: scenario.netDays,
          prepayPercent: scenario.prepayPercent ?? undefined,
          subtotal,
          discountPercent: scenario.discountPercent,
          total,
          status: scenario.status,
          createdAt: scenario.createdAt,
          addOns: { connect: scenario.addOnIds.map((id) => ({ id })) },
        },
        update: {
          package: { connect: { id: scenario.packageId } },
          quantity: scenario.quantity,
          customerName: scenario.customerName,
          paymentKind: scenario.paymentKind,
          netDays: scenario.netDays,
          prepayPercent: scenario.prepayPercent ?? undefined,
          subtotal,
          discountPercent: scenario.discountPercent,
          total,
          status: scenario.status,
          createdAt: scenario.createdAt,
          addOns: { set: scenario.addOnIds.map((id) => ({ id })) },
        },
      });

      const chain = buildApprovalChain(scenario.discountPercent, scenario.paymentKind, scenario.netDays);
      const workflowId = `awf_${scenario.id}`;
      await prisma.approvalWorkflow.upsert({ where: { id: workflowId }, create: { id: workflowId, quote: { connect: { id: scenario.id } } }, update: {} });

      // reset steps
      const existingStepsCov = await prisma.approvalStep.findMany({ where: { approvalWorkflowId: workflowId } });
      if (existingStepsCov.length > 0) {
        await prisma.approvalStep.deleteMany({ where: { approvalWorkflowId: workflowId } });
      }

      const stepBaseTime = minutesAfter(scenario.createdAt, 1);
      let order2 = 1;
      for (let i = 0; i < chain.length; i++) {
        const persona = chain[i]!;
        let status: ApprovalStatus = ApprovalStatus.Approved;
        let approvedAt: Date | null = minutesAfter(stepBaseTime, i + 1);

        // First AE auto-approve; others approved to ensure final Approved status
        await prisma.approvalStep.create({
          data: {
            id: `step_${scenario.id}_${order2}`,
            approvalWorkflowId: workflowId,
            stepOrder: order2,
            persona,
            approverId: existingUser.id,
            status,
            approvedAt: approvedAt ?? undefined,
          },
        });
        order2 += 1;
      }

      covIndex += 1;
    }
  }

  console.log("Seeded Zoom-style demo data + coverage quotes ✔️");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


