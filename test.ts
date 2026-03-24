import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nftiujiwibmqwudphirj.supabase.co';
const supabaseKey = 'sb_publishable_DxdBiTxhs92UQRHRupe9LQ_LiFZNMyn';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('patients').update({
    notes: JSON.stringify({ customRate: 50 })
  }).eq('id', '00000000-0000-0000-0000-000000000000').select();
  console.log(data, error);
}
test();
