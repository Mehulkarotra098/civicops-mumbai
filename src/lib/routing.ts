// Ward and department routing. Pure functions: callers pass in reference data and the
// active routing rules so the same logic is used by the API, the importer and the tests.
import {
  haversineM, matchLocalities, nearestRoad, prefixCandidates, wardForPoint,
  type LocalityRow, type RoadRow, type WardShape,
} from './geo.ts';

export interface RoutingRule {
  ward_code: string | null;
  category_code: string;
  primary_department: string;
  supporting_departments: string[];
}

export interface FacilityRow { facility_id: string; type: string; name: string; lat: number; lon: number; emergency_services: boolean }
export interface HotspotRow { hotspot_id: string; name: string; lat: number; lon: number; years_flagged_last_5: number }

export interface RefData {
  wards: WardShape[];
  localities: LocalityRow[];
  roads: RoadRow[];
  facilities: FacilityRow[];
  hotspots: HotspotRow[];
}

export interface LocationInput {
  lat?: number | null;
  lon?: number | null;
  gpsAccuracyM?: number | null;
  source?: 'gps' | 'pin' | 'locality' | 'address';
  localityText?: string | null;
  address?: string | null;
  landmark?: string | null;
  /** Locality name the resident picked from the suggestion list. */
  confirmedLocality?: string | null;
}

export type LocationStatus = 'confident' | 'ambiguous' | 'conflict' | 'out_of_bounds' | 'uncertain_gps' | 'missing';

export interface LocationResult {
  status: LocationStatus;
  wardCode: string | null;
  suggestedWardCode: string | null;
  confidence: 'high' | 'medium' | 'low';
  message: string;
  pointWard: string | null;
  textWard: string | null;
  candidates: { locality: string; ward_code: string; lat: number | null; lon: number | null }[];
  locality: string | null;
  lat: number | null;
  lon: number | null;
  road: { road_id: string; road_name: string; road_type: string; under_dlp: boolean; bus_route: boolean; distance_m: number } | null;
  nearbyFacilities: { name: string; type: string; distance_m: number; emergency: boolean }[];
  nearbyHotspot: { name: string; distance_m: number; years_flagged_last_5: number } | null;
}

const GPS_UNCERTAIN_M = 1000;

export function resolveLocation(input: LocationInput, ref: RefData): LocationResult {
  const hasPoint = typeof input.lat === 'number' && typeof input.lon === 'number' && !Number.isNaN(input.lat) && !Number.isNaN(input.lon);
  const pointUncertain = hasPoint && input.source === 'gps' && (input.gpsAccuracyM ?? 0) > GPS_UNCERTAIN_M;
  const pointWardShape = hasPoint ? wardForPoint(input.lat as number, input.lon as number, ref.wards) : null;
  const pointWard = pointWardShape?.ward_code ?? null;

  // Text side: an explicitly confirmed locality wins over parsing free text.
  let textWard: string | null = null;
  let locality: LocalityRow | null = null;
  let candidates: LocalityRow[] = [];
  if (input.confirmedLocality) {
    locality = ref.localities.find((l) => l.name === input.confirmedLocality) ?? null;
    textWard = locality?.ward_code ?? null;
  } else {
    const text = [input.localityText, input.address, input.landmark].filter(Boolean).join(' , ');
    if (text.trim()) {
      const matches = matchLocalities(text, ref.localities);
      const wardsSeen = [...new Set(matches.map((m) => m.locality.ward_code))];
      if (matches.length && wardsSeen.length === 1) {
        locality = matches[0].locality;
        textWard = locality.ward_code;
      } else if (wardsSeen.length > 1) {
        candidates = matches.map((m) => m.locality);
      }
      if (!locality && !candidates.length && input.localityText) {
        const pre = prefixCandidates(input.localityText, ref.localities);
        const preWards = [...new Set(pre.map((p) => p.ward_code))];
        if (pre.length && preWards.length > 1) candidates = pre;
        else if (pre.length === 1) { locality = pre[0]; textWard = pre[0].ward_code; }
      }
    }
  }

  // A bare GPS or pin location still gets a human-readable area: the nearest gazetteer locality in that ward.
  if (!locality && hasPoint && pointWard) {
    const near = ref.localities
      .filter((l) => l.ward_code === pointWard && l.lat != null && l.lon != null)
      .map((l) => ({ l, d: haversineM(input.lat as number, input.lon as number, l.lat as number, l.lon as number) }))
      .sort((a, b) => a.d - b.d)[0];
    if (near && near.d < 2500) locality = near.l;
  }
  const lat = hasPoint ? (input.lat as number) : locality?.lat ?? null;
  const lon = hasPoint ? (input.lon as number) : locality?.lon ?? null;
  const base = enrich(lat, lon, ref);
  const cand = candidates.map((c) => ({ locality: c.name, ward_code: c.ward_code, lat: c.lat, lon: c.lon }));
  const result = (r: Partial<LocationResult> & Pick<LocationResult, 'status' | 'confidence' | 'message'>): LocationResult => ({
    wardCode: null, suggestedWardCode: null, pointWard, textWard, candidates: cand,
    locality: locality?.name ?? null, lat, lon, ...base, ...r,
  });

  if (hasPoint && !pointWard && !pointUncertain) {
    return result({
      status: 'out_of_bounds', confidence: 'low', suggestedWardCode: textWard,
      message: 'The pin is outside the known ward boundaries. The report will go to the triage queue for a ward officer to place it.',
    });
  }
  if (pointWard && textWard && pointWard !== textWard && !pointUncertain) {
    return result({
      status: 'conflict', confidence: 'low', suggestedWardCode: pointWard,
      message: `The address points to Ward ${textWard} but the map pin is in Ward ${pointWard}. Move the pin or fix the address, or submit and the triage team will decide.`,
    });
  }
  if (pointWard && !pointUncertain) {
    return result({
      status: 'confident', confidence: textWard ? 'high' : input.source === 'gps' ? 'high' : 'medium', wardCode: pointWard, suggestedWardCode: pointWard,
      message: `This location is in Ward ${pointWard}.`,
    });
  }
  if (textWard) {
    return result({
      status: 'confident', confidence: 'medium', wardCode: textWard, suggestedWardCode: textWard,
      message: pointUncertain
        ? `GPS was too imprecise (±${Math.round(input.gpsAccuracyM ?? 0)} m), so the ward comes from the locality you gave: Ward ${textWard}.`
        : `Matched ${locality?.name ?? 'the locality'} in Ward ${textWard}.`,
    });
  }
  if (candidates.length) {
    const wards = [...new Set(candidates.map((c) => c.ward_code))].join(' or ');
    return result({
      status: 'ambiguous', confidence: 'low',
      message: `"${input.localityText ?? input.address}" could be in Ward ${wards}. Pick the right locality, or submit and the triage team will confirm.`,
    });
  }
  if (pointUncertain) {
    return result({
      status: 'uncertain_gps', confidence: 'low', suggestedWardCode: pointWard,
      message: `GPS accuracy is low (±${Math.round(input.gpsAccuracyM ?? 0)} m). Drop a pin or search for your locality.`,
    });
  }
  return result({ status: 'missing', confidence: 'low', message: 'Add a location: use GPS, drop a pin, or search for your locality.' });
}

function enrich(lat: number | null, lon: number | null, ref: RefData) {
  if (lat == null || lon == null) return { road: null, nearbyFacilities: [], nearbyHotspot: null };
  const nr = nearestRoad(lat, lon, ref.roads, 250);
  const facilities = ref.facilities
    .map((f) => ({ name: f.name, type: f.type, emergency: f.emergency_services, distance_m: Math.round(haversineM(lat, lon, f.lat, f.lon)) }))
    .filter((f) => f.distance_m <= 500)
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, 3);
  const hs = ref.hotspots
    .map((h) => ({ name: h.name, years_flagged_last_5: h.years_flagged_last_5, distance_m: Math.round(haversineM(lat, lon, h.lat, h.lon)) }))
    .filter((h) => h.distance_m <= 600)
    .sort((a, b) => a.distance_m - b.distance_m)[0] ?? null;
  return {
    road: nr ? {
      road_id: nr.road.road_id, road_name: nr.road.road_name, road_type: nr.road.road_type,
      under_dlp: nr.road.under_dlp, bus_route: nr.road.bus_route, distance_m: Math.round(nr.distanceM),
    } : null,
    nearbyFacilities: facilities,
    nearbyHotspot: hs,
  };
}

export interface DepartmentRoute {
  primary: string | null;
  supporting: string[];
  ruleScope: 'ward' | 'city' | 'none';
  teamUnclear: boolean;
  reasons: string[];
}

/** Pick the primary and supporting departments from the active rules plus the report's details. */
export function routeDepartment(category: string, wardCode: string | null, details: Record<string, unknown>, rules: RoutingRule[]): DepartmentRoute {
  const wardRule = wardCode ? rules.find((r) => r.ward_code === wardCode && r.category_code === category) : undefined;
  const cityRule = rules.find((r) => r.ward_code === null && r.category_code === category);
  const rule = wardRule ?? cityRule;
  const reasons: string[] = [];
  const supporting = new Set(rule?.supporting_departments ?? []);

  if (category === 'fallen_tree' && (details.wires === 'yes' || details.wires === 'possible')) {
    supporting.add('ELE');
    reasons.push('Possible contact with electric wires: Street Lighting & Electrical added as a supporting team');
  }
  const blocking = Array.isArray(details.blocking) ? (details.blocking as string[]) : [];
  if (category === 'fallen_tree' && (blocking.includes('emergency') || blocking.includes('all_lanes'))) {
    supporting.add('DMC');
    reasons.push('Road or emergency access fully blocked: Disaster Management Cell added as a supporting team');
  }
  if (category === 'waterlogging' && (details.access === 'emergency' || details.depth === 'waist')) {
    supporting.add('DMC');
    reasons.push('Severe flooding: Disaster Management Cell added as a supporting team');
  }
  if (category === 'water_supply' && details.severity === 'gushing') {
    supporting.add('SWD');
    reasons.push('Water flooding the road: Storm Water Drains added to clear the road');
  }
  if (category === 'streetlight' && (details.damage === 'wires' || details.damage === 'fallen')) {
    supporting.add('DMC');
    reasons.push('Exposed wires or fallen pole: area to be secured');
  }

  const teamUnclear = category === 'public_space_other' && (details.subtype === 'other' || !details.subtype);
  if (teamUnclear) reasons.push('The responsible team is unclear, so a ward reviewer will route it');
  if (!rule) return { primary: null, supporting: [...supporting], ruleScope: 'none', teamUnclear: true, reasons: [...reasons, 'No routing rule found for this category'] };
  supporting.delete(rule.primary_department);
  return {
    primary: teamUnclear ? null : rule.primary_department,
    supporting: [...supporting],
    ruleScope: wardRule ? 'ward' : 'city',
    teamUnclear,
    reasons: [`${wardRule ? `Ward ${wardCode} rule` : 'City-wide rule'}: ${category} → ${rule.primary_department}`, ...reasons],
  };
}
