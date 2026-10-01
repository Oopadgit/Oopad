import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePools } from '../server/source.js';

const pool = '0x' + '1'.repeat(40);
const base = '0x' + '2'.repeat(40);
const quote = '0x' + '3'.repeat(40);
function response(marketCap: unknown, fdv: unknown) {
  return {
    data: [{ type:'pool', id:`robinhood_${pool}`, attributes:{ address:pool, market_cap_usd:marketCap, fdv_usd:fdv }, relationships: {
      base_token:{data:{id:`robinhood_${base}`}}, quote_token:{data:{id:`robinhood_${quote}`}}, dex:{data:{id:'pons-v2'}}
    }}],
    included:[base,quote].map((address,i) => ({type:'token',id:`robinhood_${address}`,attributes:{address,symbol:i?'ETH':'EXAMPLE',name:i?'Ether':'Example'}}))
  };
}
test('pool valuation retains market cap and FDV as distinct source fields', () => {
  const [row] = parsePools(response('25000','100000'));
  assert.equal(row.marketCap,25000);
  assert.equal(row.fdv,100000);
});
test('missing and invalid pool valuations remain unknown', () => {
  const [row] = parsePools(response(null,'-1'));
  assert.equal(row.marketCap,null);
  assert.equal(row.fdv,null);
});
