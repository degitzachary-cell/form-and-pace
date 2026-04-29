// Calendar markers — race / sick / taper / travel ribbons that overlay
// the training calendar. Stored in the calendar_markers table.

import { supabase } from "./supabase.js";

// Visual treatment for each marker kind. dot is used for the day-cell
// indicator, ribbon for the band that hovers above the cell content.
export const MARKER_STYLE = {
  race:   { dot: "var(--c-hot)",    ribbon: "var(--c-hot)",    ink: "#FBF8F1", label: "Race"   },
  sick:   { dot: "var(--c-warn)",   ribbon: "var(--c-warn)",   ink: "#FBF8F1", label: "Sick"   },
  taper:  { dot: "var(--c-cool)",   ribbon: "var(--c-cool)",   ink: "#FBF8F1", label: "Taper"  },
  travel: { dot: "#7B5A8C",         ribbon: "#7B5A8C",         ink: "#FBF8F1", label: "Travel" },
  other:  { dot: "var(--c-mute)",   ribbon: "var(--c-mute)",   ink: "#FBF8F1", label: "Note"   },
};

export const MARKER_KINDS = ["race", "sick", "taper", "travel", "other"];

// Fetch all calendar markers for the given athlete.
export async function fetchMarkersForAthlete(email) {
  if (!email) return [];
  const { data, error } = await supabase
    .from("calendar_markers")
    .select("*")
    .eq("athlete_email", email.toLowerCase())
    .order("marker_date", { ascending: true });
  if (error) {
    console.error("fetchMarkersForAthlete failed:", error);
    return [];
  }
  return data || [];
}

// Find every marker that intersects the given date string (YYYY-MM-DD).
// A marker covers [marker_date, end_date ?? marker_date].
export function markersOnDate(markers, dateStr) {
  if (!dateStr || !Array.isArray(markers)) return [];
  return markers.filter(m => {
    const start = m.marker_date;
    const end = m.end_date || start;
    return start <= dateStr && dateStr <= end;
  });
}

// Insert / update / delete helpers. Coach-or-self enforced via RLS, so
// callers don't need to check role here.
export async function createMarker({ athleteEmail, kind, markerDate, endDate, label, isARace, createdBy }) {
  const { data, error } = await supabase
    .from("calendar_markers")
    .insert({
      athlete_email: athleteEmail.toLowerCase(),
      kind,
      marker_date: markerDate,
      end_date: endDate || null,
      label: label || null,
      is_a_race: !!isARace,
      created_by_email: createdBy?.toLowerCase() || null,
    })
    .select()
    .single();
  if (error) { console.error("createMarker failed:", error); return null; }
  return data;
}

export async function deleteMarker(id) {
  const { error } = await supabase.from("calendar_markers").delete().eq("id", id);
  if (error) { console.error("deleteMarker failed:", error); return false; }
  return true;
}
