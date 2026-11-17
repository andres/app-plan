import { Plan } from './schema.ts';

/** A small, complete plan used as the "Open an example" starter and in tests. */
export function examplePlan(): Plan {
  return Plan.parse({
    schemaVersion: 1,
    name: 'Example: Class booking',
    summary:
      'A booking app for a small gym. Members see the weekly class schedule, book a spot and pay per class. Coaches see who is coming. The owner manages classes.',
    goals: 'Members can book a class in under 30 seconds on a phone\nNo double-booking when a class is full\nOwner sees revenue per week',
    nonGoals: 'Memberships / subscriptions (pay per class only)\nNative mobile apps',
    constraints: 'Mobile-first web app (PWA)\nPayments with Stripe Checkout\nHost on a single small server',
    acSeq: 8,
    roles: [
      { name: 'Member', description: 'Books and pays for classes.' },
      { name: 'Coach', description: 'Sees attendee lists for their classes.' },
      { name: 'Admin', description: 'Gym owner. Manages classes and coaches.' },
    ],
    nodes: [
      { id: 's1', kind: 'screen', name: 'Sign in', position: { x: 0, y: 0 }, route: '/login', components: ['Email field', 'Send magic link button'], notes: 'Passwordless: magic link by email.', criteria: [
        { id: 'AC-1', text: 'Given a registered email, when I request a link and open it, then I am signed in and land on Schedule.' },
        { id: 'AC-2', text: 'Given a link older than 15 minutes, when I open it, then I see "Link expired" and can request a new one.' },
      ] },
      { id: 's2', kind: 'screen', name: 'Schedule', position: { x: 260, y: 0 }, route: '/', roles: ['Member', 'Coach', 'Admin'], components: ['Week picker', 'List of classes per day: time, name, coach, spots left'], notes: 'Full classes are shown greyed out with "Full".', criteria: [
        { id: 'AC-3', text: 'Given a class with no spots left, when I view the schedule, then it shows "Full" and cannot be opened for booking.' },
      ] },
      { id: 's3', kind: 'screen', name: 'Class detail', position: { x: 520, y: 0 }, route: '/classes/:id', roles: ['Member'], components: ['Class name, time, coach, description', 'Price', 'Book & pay button'], notes: 'If the member already booked: show "Booked" and a Cancel button (free cancel until 12h before).', criteria: [
        { id: 'AC-4', text: 'Given a class with spots, when I tap Book & pay and complete Stripe Checkout, then my booking is confirmed and shows in My bookings.' },
        { id: 'AC-5', text: 'Given two members paying for the last spot at the same time, then only one booking is confirmed and the other is refunded.' },
        { id: 'AC-6', text: 'Given a confirmed booking more than 12h ahead, when I cancel, then it is cancelled and refunded.' },
      ] },
      { id: 's4', kind: 'screen', name: 'My bookings', position: { x: 520, y: 200 }, route: '/me', roles: ['Member'], components: ['Upcoming bookings', 'Past bookings'], criteria: [
        { id: 'AC-7', text: 'I only ever see my own bookings, never another member\'s.' },
      ] },
      { id: 's5', kind: 'screen', name: 'Manage classes', position: { x: 260, y: 200 }, route: '/admin/classes', roles: ['Admin'], components: ['Table of classes', 'New class form: name, coach, start, duration, capacity, price'], criteria: [
        { id: 'AC-8', text: 'Given I am not an Admin, when I open /admin/classes or call its API, then I get a 403.' },
      ] },
      { id: 'e1', kind: 'entity', name: 'User', position: { x: 0, y: 0 }, fields: [
        { name: 'email', type: 'email', required: true, notes: 'unique' },
        { name: 'name', type: 'string', required: true },
        { name: 'role', type: 'enum', required: true, notes: 'member | coach | admin; default member' },
      ] },
      { id: 'e2', kind: 'entity', name: 'Class', position: { x: 320, y: 0 }, fields: [
        { name: 'name', type: 'string', required: true },
        { name: 'startsAt', type: 'datetime', required: true },
        { name: 'durationMin', type: 'integer', required: true },
        { name: 'capacity', type: 'integer', required: true },
        { name: 'priceCents', type: 'integer', required: true },
        { name: 'coachId', type: 'reference', required: true, notes: '-> User with role coach' },
      ] },
      { id: 'e3', kind: 'entity', name: 'Booking', position: { x: 160, y: 260 }, fields: [
        { name: 'userId', type: 'reference', required: true, notes: '-> User' },
        { name: 'classId', type: 'reference', required: true, notes: '-> Class' },
        { name: 'status', type: 'enum', required: true, notes: 'pending_payment | confirmed | cancelled' },
        { name: 'stripeSessionId', type: 'string' },
      ], notes: 'Unique (userId, classId). Confirmed bookings for a class must never exceed capacity.' },
      { id: 'c1', kind: 'component', type: 'actor', name: 'Member', position: { x: 0, y: 80 } },
      { id: 'c2', kind: 'component', type: 'frontend', name: 'Web app', tech: 'React PWA', position: { x: 280, y: 80 } },
      { id: 'c3', kind: 'component', type: 'backend', name: 'API', tech: 'Node', position: { x: 560, y: 80 } },
      { id: 'c4', kind: 'component', type: 'database', name: 'Database', tech: 'Postgres', position: { x: 880, y: -20 } },
      { id: 'c5', kind: 'component', type: 'external', name: 'Stripe', tech: 'Stripe Checkout', position: { x: 880, y: 200 } },
    ],
    edges: [
      { id: 'n1', kind: 'navigates', source: 's1', target: 's2', label: 'after login' },
      { id: 'n2', kind: 'navigates', source: 's2', target: 's3', label: 'tap a class' },
      { id: 'n3', kind: 'navigates', source: 's3', target: 's4', label: 'after payment' },
      { id: 'n4', kind: 'navigates', source: 's2', target: 's5', label: 'Admin menu' },
      { id: 'r1', kind: 'relation', source: 'e1', target: 'e3', label: 'makes', cardinality: '1:n' },
      { id: 'r2', kind: 'relation', source: 'e2', target: 'e3', label: 'has', cardinality: '1:n' },
      { id: 'r3', kind: 'relation', source: 'e1', target: 'e2', label: 'coaches', cardinality: '1:n' },
      { id: 'k1', kind: 'calls', source: 'c1', target: 'c2', label: 'uses' },
      { id: 'k2', kind: 'calls', source: 'c2', target: 'c3', label: 'REST/JSON' },
      { id: 'k3', kind: 'calls', source: 'c3', target: 'c4', label: 'SQL' },
      { id: 'k4', kind: 'calls', source: 'c3', target: 'c5', label: 'create checkout session' },
      { id: 'k5', kind: 'calls', source: 'c5', target: 'c3', label: 'webhook: payment succeeded', sourceHandle: 'b', targetHandle: 'b' },
    ],
  });
}
