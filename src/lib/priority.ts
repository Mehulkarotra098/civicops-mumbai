// Suggested priority from impact and exposure. Staff can revise it with a recorded reason.
import type { Priority } from './config.ts';

export interface PriorityContext {
  roadType?: string | null;
  busRoute?: boolean;
  nearbyFacilities?: { name: string; type: string; distance_m: number; emergency: boolean }[];
  nearbyHotspot?: { name: string; years_flagged_last_5: number } | null;
}

const rank: Record<Priority, number> = { standard: 0, medium: 1, critical: 2 };
const max = (a: Priority, b: Priority): Priority => (rank[a] >= rank[b] ? a : b);

export function suggestPriority(category: string, d: Record<string, unknown>, ctx: PriorityContext = {}): { priority: Priority; reasons: string[] } {
  let p = 'standard' as Priority;
  const reasons: string[] = [];
  const up = (to: Priority, why: string) => { if (rank[to] > rank[p]) p = to; reasons.push(why); };
  const majorRoad = ctx.roadType === 'Highway' || ctx.roadType === 'Arterial' || ctx.busRoute === true;
  const hospital = ctx.nearbyFacilities?.find((f) => f.type === 'Hospital' && f.distance_m <= 400);
  const school = ctx.nearbyFacilities?.find((f) => f.type === 'School' && f.distance_m <= 300);
  const blocking = Array.isArray(d.blocking) ? (d.blocking as string[]) : [];

  switch (category) {
    case 'waterlogging':
      if (d.access === 'emergency') up('critical', 'Emergency access is blocked');
      else if (d.access === 'full' && majorRoad) up('critical', 'A major road is fully blocked');
      else if (d.depth === 'waist') up('critical', 'Water is waist-deep or more');
      else if (d.access === 'full') up('medium', 'Access is fully blocked on a local road');
      else if (d.access === 'partial' || d.depth === 'knee') up('medium', 'Access is partly blocked or water is knee-deep');
      if (d.trend === 'rising' && rank[p] >= 1 && (hospital || majorRoad)) up('critical', 'Water is still rising near a hospital or on a major road');
      if (ctx.nearbyHotspot) reasons.push(`Known flood hotspot nearby: ${ctx.nearbyHotspot.name} (flagged ${ctx.nearbyHotspot.years_flagged_last_5} of the last 5 years)`);
      if (p === 'standard') up('medium', 'Waterlogging during the monsoon is treated as at least medium');
      break;
    case 'fallen_tree':
      if (d.wires === 'yes') up('critical', 'The tree is reported touching electric wires');
      if (blocking.includes('emergency')) up('critical', 'Emergency access is blocked');
      if (blocking.includes('all_lanes')) up('critical', 'All lanes are blocked');
      if (d.wires === 'possible') up('medium', 'Possible contact with wires');
      if (blocking.includes('one_lane') || blocking.includes('entrance')) up('medium', 'A lane or an entrance is blocked');
      if (d.tree_state === 'hanging') up('medium', 'A hanging branch may fall');
      break;
    case 'water_supply':
      if (d.severity === 'gushing' && (d.affected === 'road' || d.affected === 'many' || majorRoad)) up('critical', 'A burst main is flooding the road');
      if (d.supply_stopped === 'yes' && d.affected === 'many') up('critical', 'Many homes have lost water supply');
      if (d.severity === 'steady' || d.severity === 'gushing') up('medium', 'Steady or heavy leak');
      if (d.supply_stopped === 'yes') up('medium', 'Water supply has stopped');
      break;
    case 'missed_garbage':
      if (d.recurrence === 'regular') up('medium', 'Collection is missed regularly');
      if (d.footpath_blocked === 'yes') up('medium', 'Waste is blocking the footpath');
      if (p === 'standard') reasons.push('A routine missed pickup follows the standard policy');
      break;
    case 'illegal_dumping':
      if (d.obstruction && d.obstruction !== 'none') up('medium', 'The waste blocks access');
      break;
    case 'drain_sewer':
      if (d.problem === 'open_manhole' && (d.impact === 'road' || d.impact === 'walkway')) up('critical', 'Open manhole on a road or walkway');
      else if (d.problem === 'open_manhole') up('medium', 'Open manhole');
      if (d.problem === 'overflow' && (d.impact === 'homes' || d.impact === 'walkway')) up('medium', 'Sewage overflowing onto a walkway or into homes');
      break;
    case 'road_damage':
      if (d.defect === 'cave_in') up('critical', 'Road cave-in');
      if (d.size === 'large' && d.lane !== 'footpath') up('critical', 'Large crater in a traffic lane');
      if (d.mobility === 'accident_risk') up('medium', 'Accident risk reported');
      if (d.mobility === 'swerving' || d.mobility === 'blocked_wheelchair') up('medium', 'Vehicles swerve or wheelchairs cannot pass');
      if (majorRoad && d.lane !== 'footpath') up('medium', 'On a main road or bus route');
      break;
    case 'streetlight':
      if (d.damage === 'wires' || d.damage === 'fallen') up('critical', 'Exposed wires or a fallen pole');
      if (d.extent === 'stretch') up('medium', 'A whole stretch is dark');
      break;
    case 'public_space_other':
      if (d.subtype === 'obstruction') up('medium', 'Unsafe obstruction');
      break;
  }
  // Exposure: a medium flood, tree, burst or open-manhole report next to an emergency
  // hospital is raised to critical, because ambulance access is at stake.
  const exposureCategories = ['waterlogging', 'fallen_tree', 'water_supply', 'drain_sewer'];
  if (hospital?.emergency && p === 'medium' && exposureCategories.includes(category)) {
    p = max(p, 'critical');
    reasons.push(`Within ${hospital.distance_m} m of ${hospital.name} (emergency services), so raised to critical`);
  } else if (school && rank[p] >= 1) {
    reasons.push(`Near ${school.name} (${school.distance_m} m)`);
  }
  if (!reasons.length) reasons.push('No high-impact factors reported');
  return { priority: p, reasons };
}
