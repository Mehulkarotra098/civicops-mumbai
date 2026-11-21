// Product configuration that seeds the database. After seeding, routing rules and SLA
// policies are edited in Admin and versioned in the database; this file is only the
// starting point. Department names are illustrative municipal functions, not an official
// BMC organogram.

export type Priority = 'critical' | 'medium' | 'standard';

export type QuestionType = 'select' | 'multiselect' | 'text' | 'number' | 'date' | 'yesno';
export interface Question {
  key: string;
  label: string;
  type: QuestionType;
  options?: { value: string; label: string }[];
  help?: string;
  optional?: boolean;
}

export interface CategoryConfig {
  code: string;
  label: string;
  short: string;
  icon: string;
  primaryDepartment: string;
  urgencyGuidance: string;
  evidenceRequired: string;
  closureCheck: string;
  photoRequiredForClosure: boolean;
  /** Extra closure milestone the officer records, shown on the ticket. */
  restorationMilestone?: { field: 'access_restored_at' | 'supply_restored_at'; label: string };
  questions: Question[];
}

export const DEPARTMENTS = [
  { code: 'SWD', name: 'Storm Water Drains', short: 'Storm water', description: 'Waterlogging, storm drains, dewatering pumps' },
  { code: 'HYD', name: 'Hydraulic Engineering (Water Supply)', short: 'Water supply', description: 'Burst mains, leaks, supply outages' },
  { code: 'SWM', name: 'Solid Waste Management', short: 'Solid waste', description: 'Collection, bins, bulk waste and dumping' },
  { code: 'GDN', name: 'Gardens & Tree Authority', short: 'Trees', description: 'Fallen trees, unsafe branches, tree trimming' },
  { code: 'RDS', name: 'Roads & Traffic', short: 'Roads', description: 'Potholes, road surface, footpaths, paver blocks' },
  { code: 'SEW', name: 'Sewerage Operations', short: 'Sewerage', description: 'Blocked drains, sewer overflow, manhole covers' },
  { code: 'ELE', name: 'Street Lighting & Electrical', short: 'Electrical', description: 'Streetlights, poles, wire hazards (liaises with the power utility)' },
  { code: 'MNT', name: 'Ward Maintenance', short: 'Maintenance', description: 'Parks, signage, public spaces, other issues' },
  { code: 'DMC', name: 'Disaster Management Cell', short: 'Disaster mgmt', description: 'Supports critical floods and obstructions' },
] as const;

const yesNo = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Not sure' },
];

export const CATEGORIES: CategoryConfig[] = [
  {
    code: 'waterlogging',
    label: 'Waterlogging or flooded road',
    short: 'Waterlogging',
    icon: 'droplets',
    primaryDepartment: 'SWD',
    urgencyGuidance: 'Critical if access is fully blocked or emergency vehicles cannot pass on a major road, or water is waist-deep. Medium if a lane is partly blocked.',
    evidenceRequired: 'Before photo of the affected stretch if safe. After photo of the same stretch, plus the time access was restored.',
    closureCheck: 'Same location; the affected stretch has cleared; the officer documented the action taken and when access was restored.',
    photoRequiredForClosure: true,
    restorationMilestone: { field: 'access_restored_at', label: 'Access restored' },
    questions: [
      { key: 'stretch', label: 'Which stretch is affected?', type: 'text', help: 'For example: "Juhu Tara Road from the church to the signal, about 150 m"' },
      {
        key: 'depth', label: 'How deep is the water?', type: 'select', options: [
          { value: 'ankle', label: 'Ankle deep (under 15 cm)' },
          { value: 'knee', label: 'Knee deep (15–45 cm)' },
          { value: 'waist', label: 'Waist deep or more (over 45 cm)' },
          { value: 'unknown', label: "Don't know" },
        ],
      },
      {
        key: 'trend', label: 'Is the water rising or going down?', type: 'select', options: [
          { value: 'rising', label: 'Rising' },
          { value: 'steady', label: 'Not changing' },
          { value: 'receding', label: 'Going down' },
          { value: 'unknown', label: "Don't know" },
        ],
      },
      {
        key: 'access', label: 'Is access blocked?', type: 'select', options: [
          { value: 'none', label: 'No, traffic and people can pass' },
          { value: 'partial', label: 'Partly blocked' },
          { value: 'full', label: 'Fully blocked' },
          { value: 'emergency', label: 'Ambulance or fire access blocked' },
        ],
      },
    ],
  },
  {
    code: 'fallen_tree',
    label: 'Fallen tree or unsafe branch',
    short: 'Fallen tree',
    icon: 'tree',
    primaryDepartment: 'GDN',
    urgencyGuidance: 'Critical if it blocks emergency access or all lanes, or may be touching electric wires. Medium if it blocks one lane or an entrance.',
    evidenceRequired: 'Photo of the obstruction from a safe distance. After photo showing the obstruction cleared at the same spot. Any supporting-team handoff recorded.',
    closureCheck: 'Obstruction cleared at the same location; supporting department handoff (e.g. electrical) recorded when wires were involved.',
    photoRequiredForClosure: true,
    questions: [
      {
        key: 'tree_state', label: 'What do you see?', type: 'select', options: [
          { value: 'fallen', label: 'Fallen tree' },
          { value: 'hanging', label: 'Hanging or broken branch' },
          { value: 'leaning', label: 'Leaning tree that may fall' },
        ],
      },
      {
        key: 'blocking', label: 'What is blocked?', type: 'multiselect', options: [
          { value: 'none', label: 'Nothing is blocked' },
          { value: 'footpath', label: 'Footpath' },
          { value: 'one_lane', label: 'One lane' },
          { value: 'all_lanes', label: 'All lanes' },
          { value: 'entrance', label: 'Building or gate entrance' },
          { value: 'emergency', label: 'Emergency access (hospital, fire)' },
        ],
      },
      {
        key: 'wires', label: 'Could it be touching electric wires?', type: 'select', options: [
          { value: 'no', label: 'No' },
          { value: 'possible', label: 'Possibly' },
          { value: 'yes', label: 'Yes, touching wires' },
          { value: 'unsure', label: 'Not sure' },
        ], help: 'Stay away from any fallen wires. You can submit without a photo.',
      },
    ],
  },
  {
    code: 'water_supply',
    label: 'Burst pipe, leak or water outage',
    short: 'Water supply',
    icon: 'pipe',
    primaryDepartment: 'HYD',
    urgencyGuidance: 'Critical if a burst main is flooding the road or many homes have lost supply. Medium for a steady leak or a building without water.',
    evidenceRequired: 'Photo of the leak if visible. After photo of the repair, plus a separate update when supply is restored.',
    closureCheck: 'Leak contained or repaired; where supply stopped, a separate supply-restored update is recorded.',
    photoRequiredForClosure: true,
    restorationMilestone: { field: 'supply_restored_at', label: 'Supply restored' },
    questions: [
      {
        key: 'problem', label: 'What is the problem?', type: 'select', options: [
          { value: 'burst', label: 'Burst pipe' },
          { value: 'leak', label: 'Visible leak' },
          { value: 'no_supply', label: 'No water supply' },
          { value: 'quality', label: 'Low pressure or dirty water' },
        ],
      },
      {
        key: 'severity', label: 'How bad is the leak?', type: 'select', optional: true, options: [
          { value: 'small', label: 'Small leak or drip' },
          { value: 'steady', label: 'Steady flow' },
          { value: 'gushing', label: 'Gushing, flooding the road' },
        ],
      },
      {
        key: 'affected', label: 'Who or what is affected?', type: 'select', options: [
          { value: 'few_homes', label: 'A few homes' },
          { value: 'building', label: 'One building or society' },
          { value: 'many', label: 'A whole lane or many buildings' },
          { value: 'road', label: 'The road (water on the road)' },
        ],
      },
      { key: 'supply_stopped', label: 'Has the water supply stopped?', type: 'select', options: yesNo },
    ],
  },
  {
    code: 'missed_garbage',
    label: 'Missed garbage pickup or overflowing bin',
    short: 'Missed pickup',
    icon: 'trash',
    primaryDepartment: 'SWM',
    urgencyGuidance: 'Standard by default. Medium if collection is regularly missed or waste blocks the footpath.',
    evidenceRequired: 'Photo of the pickup point if possible. After photo showing waste removed from the same point.',
    closureCheck: 'Waste removed from the reported location. Recurring missed service stays visible in ward insights.',
    photoRequiredForClosure: true,
    questions: [
      { key: 'pickup_point', label: 'Where is the pickup point?', type: 'text', help: 'For example: "Bin outside Sea Breeze Society, gate 2"' },
      { key: 'missed_date', label: 'Which collection was missed?', type: 'date' },
      {
        key: 'recurrence', label: 'Has this happened before?', type: 'select', options: [
          { value: 'first', label: 'First time' },
          { value: 'few', label: '2–3 times this month' },
          { value: 'regular', label: 'It is missed regularly' },
        ],
      },
      { key: 'overflowing', label: 'Is the bin overflowing?', type: 'select', options: yesNo },
      { key: 'footpath_blocked', label: 'Is the footpath blocked?', type: 'select', options: yesNo },
    ],
  },
  {
    code: 'illegal_dumping',
    label: 'Illegal dumping or bulk waste',
    short: 'Dumping',
    icon: 'truck',
    primaryDepartment: 'SWM',
    urgencyGuidance: 'Medium if it blocks a road, footpath or entrance. Standard otherwise.',
    evidenceRequired: 'Photo of the waste if safe. After photo of the cleared area and any follow-up recorded.',
    closureCheck: 'Affected area cleared; any follow-up (fine, CCTV request) recorded.',
    photoRequiredForClosure: true,
    questions: [
      {
        key: 'waste_type', label: 'What kind of waste?', type: 'select', options: [
          { value: 'debris', label: 'Construction debris' },
          { value: 'bulk', label: 'Furniture or bulk household items' },
          { value: 'garden', label: 'Garden waste' },
          { value: 'mixed', label: 'Mixed or not sure' },
        ],
      },
      {
        key: 'size', label: 'Roughly how much?', type: 'select', options: [
          { value: 'small', label: 'Small heap' },
          { value: 'truck', label: 'About a truckload' },
          { value: 'large', label: 'Large area' },
        ],
      },
      {
        key: 'obstruction', label: 'Does it block anything?', type: 'select', options: [
          { value: 'none', label: 'No' },
          { value: 'footpath', label: 'Footpath' },
          { value: 'road', label: 'Road' },
          { value: 'entrance', label: 'An entrance' },
        ],
      },
    ],
  },
  {
    code: 'drain_sewer',
    label: 'Blocked drain, sewer overflow or open manhole',
    short: 'Drain / manhole',
    icon: 'manhole',
    primaryDepartment: 'SEW',
    urgencyGuidance: 'Critical for an open or missing manhole cover on a road or walkway. Medium for sewage overflowing onto a walkway or into homes.',
    evidenceRequired: 'Photo from a safe distance. After photo showing the drain cleared, overflow stopped, or cover safely restored.',
    closureCheck: 'Depending on the report: drain cleared, overflow addressed, or cover safely restored.',
    photoRequiredForClosure: true,
    questions: [
      {
        key: 'problem', label: 'What is the problem?', type: 'select', options: [
          { value: 'blocked', label: 'Blocked drain' },
          { value: 'overflow', label: 'Sewer overflowing' },
          { value: 'open_manhole', label: 'Open or missing manhole cover' },
          { value: 'broken_cover', label: 'Broken drain cover' },
        ],
      },
      { key: 'standing_water', label: 'Is there standing water?', type: 'select', options: yesNo },
      {
        key: 'impact', label: 'What is affected?', type: 'select', options: [
          { value: 'none', label: 'Nothing yet' },
          { value: 'walkway', label: 'Walkway or footpath' },
          { value: 'road', label: 'Road lane' },
          { value: 'homes', label: 'Homes or shops' },
        ],
      },
    ],
  },
  {
    code: 'road_damage',
    label: 'Pothole, damaged road or broken footpath',
    short: 'Road damage',
    icon: 'road',
    primaryDepartment: 'RDS',
    urgencyGuidance: 'Critical for a cave-in or a large crater blocking a lane. Medium on a main road, bus route, or where vehicles swerve or wheelchairs cannot pass.',
    evidenceRequired: 'Photo of the defect with a landmark. After photo of the same segment showing the repair.',
    closureCheck: 'Repair evidence shows the same road segment and addresses the reported defect. Roads still under the defect liability period are flagged for the original contractor.',
    photoRequiredForClosure: true,
    questions: [
      {
        key: 'defect', label: 'What is damaged?', type: 'select', options: [
          { value: 'pothole', label: 'Pothole' },
          { value: 'cave_in', label: 'Road cave-in' },
          { value: 'surface', label: 'Damaged road surface' },
          { value: 'footpath', label: 'Broken footpath or paver blocks' },
        ],
      },
      {
        key: 'size', label: 'How big?', type: 'select', options: [
          { value: 'small', label: 'Small (under 1 m)' },
          { value: 'medium', label: 'Medium (1–3 m)' },
          { value: 'large', label: 'Large (over 3 m)' },
        ],
      },
      {
        key: 'lane', label: 'Where on the road?', type: 'select', options: [
          { value: 'footpath', label: 'Footpath' },
          { value: 'one_lane', label: 'One lane' },
          { value: 'multi_lane', label: 'Several lanes' },
        ],
      },
      {
        key: 'mobility', label: 'How does it affect people?', type: 'select', options: [
          { value: 'minor', label: 'Minor' },
          { value: 'swerving', label: 'Vehicles swerve around it' },
          { value: 'blocked_wheelchair', label: 'Wheelchairs or prams cannot pass' },
          { value: 'accident_risk', label: 'Accident risk or someone fell' },
        ],
      },
    ],
  },
  {
    code: 'streetlight',
    label: 'Streetlight or damaged pole',
    short: 'Streetlight',
    icon: 'bulb',
    primaryDepartment: 'ELE',
    urgencyGuidance: 'Critical for exposed live wires or a fallen pole. Medium when a whole stretch is dark.',
    evidenceRequired: 'Pole number if known. The officer records the repair with a photo or a night-check note.',
    closureCheck: 'Officer records the repair and supplies evidence appropriate to the issue (photo, or night-check confirmation).',
    photoRequiredForClosure: false,
    questions: [
      { key: 'pole_number', label: 'Pole number (if visible)', type: 'text', optional: true },
      {
        key: 'extent', label: 'How many lights are out?', type: 'select', options: [
          { value: 'one', label: 'One light' },
          { value: 'several', label: 'Several lights' },
          { value: 'stretch', label: 'The whole stretch is dark' },
        ],
      },
      {
        key: 'damage', label: 'Any visible damage?', type: 'select', options: [
          { value: 'none', label: 'None visible' },
          { value: 'pole', label: 'Damaged pole' },
          { value: 'wires', label: 'Exposed wires' },
          { value: 'fallen', label: 'Pole has fallen' },
        ],
      },
    ],
  },
  {
    code: 'public_space_other',
    label: 'Public spaces and other issues',
    short: 'Other',
    icon: 'more',
    primaryDepartment: 'MNT',
    urgencyGuidance: 'Medium for an unsafe obstruction. Standard otherwise.',
    evidenceRequired: 'Photo if helpful. The ward reviewer confirms the action taken or routes it to the right team.',
    closureCheck: 'Ward reviewer confirms the action taken, or the issue is routed to the responsible team.',
    photoRequiredForClosure: false,
    questions: [
      {
        key: 'subtype', label: 'What kind of issue?', type: 'select', options: [
          { value: 'park', label: 'Damaged park equipment' },
          { value: 'signage', label: 'Broken signage' },
          { value: 'obstruction', label: 'Unsafe obstruction' },
          { value: 'other', label: 'Something else' },
        ],
      },
    ],
  },
];

export const CATEGORY_BY_CODE: Record<string, CategoryConfig> = Object.fromEntries(CATEGORIES.map((c) => [c.code, c]));

/** Default (city-wide) routing. Ward-specific overrides live in routing_rules. */
export const DEFAULT_ROUTING: { category: string; primary: string; supporting: string[] }[] = [
  { category: 'waterlogging', primary: 'SWD', supporting: [] },
  { category: 'fallen_tree', primary: 'GDN', supporting: [] },
  { category: 'water_supply', primary: 'HYD', supporting: [] },
  { category: 'missed_garbage', primary: 'SWM', supporting: [] },
  { category: 'illegal_dumping', primary: 'SWM', supporting: [] },
  { category: 'drain_sewer', primary: 'SEW', supporting: [] },
  { category: 'road_damage', primary: 'RDS', supporting: [] },
  { category: 'streetlight', primary: 'ELE', supporting: [] },
  { category: 'public_space_other', primary: 'MNT', supporting: [] },
];

/** SLA policy version 1, as specified for the pilot. */
export const SLA_POLICY_V1: {
  priority: Priority; label: string; firstActionHours: number | null; reminderHours: number | null;
  resolutionHours: number; alertOnSubmit: boolean; note: string;
}[] = [
  { priority: 'critical', label: 'Red · Critical', firstActionHours: 5, reminderHours: null, resolutionHours: 48, alertOnSubmit: true, note: 'Alert the team immediately. Meaningful first action within 5 hours. Final resolution tracked separately (48 h target).' },
  { priority: 'medium', label: 'Yellow · Medium', firstActionHours: null, reminderHours: 48, resolutionHours: 168, alertOnSubmit: false, note: 'Reminder at day 2. Resolve by day 7.' },
  { priority: 'standard', label: 'Orange · Standard', firstActionHours: null, reminderHours: null, resolutionHours: 240, alertOnSubmit: false, note: 'Resolve by day 10.' },
];

/** Map historical complaint categories onto CivicOps categories (for recurrence context). */
export const HIST_CATEGORY_MAP: Record<string, string> = {
  Pothole: 'road_damage',
  'Road cave-in': 'road_damage',
  'Broken paver blocks': 'road_damage',
  'Road related': 'road_damage',
  Waterlogging: 'waterlogging',
  'Open or broken manhole': 'drain_sewer',
  'Choked drain / nullah overflow': 'drain_sewer',
  Other: 'public_space_other',
};

export const MILESTONES: { status: string; pct: number; label: string }[] = [
  { status: 'submitted', pct: 10, label: 'Submitted' },
  { status: 'assigned', pct: 25, label: 'Assigned to ward and department' },
  { status: 'acknowledged', pct: 40, label: 'Acknowledged' },
  { status: 'in_progress', pct: 60, label: 'Work started' },
  { status: 'awaiting_verification', pct: 85, label: 'Completion evidence submitted' },
  { status: 'verified_resolved', pct: 100, label: 'Closure verified' },
];
