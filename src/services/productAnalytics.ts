import { isSupabaseConfigured, supabase } from '../lib/supabase';

export type ProductEventName =
  | 'route_search_submitted'
  | 'route_results_viewed'
  | 'route_selected'
  | 'report_submitted'
  | 'coverage_requested';

export async function trackProductEvent(eventName: ProductEventName): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('product_events').insert({ event_name: eventName });
  if (error) console.error(`Could not record ${eventName} product event:`, error.message);
}
