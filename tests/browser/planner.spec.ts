import {test,expect} from '@playwright/test';
test('sportswear planner generates exactly one plan and inspects evidence',async({page})=>{
 test.setTimeout(120000);
 await page.goto('/');await expect(page.getByRole('button',{name:'Generate recommended plan',exact:true}).first()).toBeVisible();
 await expect(page.getByRole('button',{name:'Lean Replenishment',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Generate recommended plan',exact:true}).first().click();
 await expect(page.getByText('Recommended plan ready. Review exceptions before approval.')).toBeVisible({timeout:60000});
 await expect(page.getByText('Margin 50% · service 50%')).toBeVisible();
 await expect(page.getByText('33,412 units', {exact:false})).toBeVisible();
 await expect(page.getByRole('columnheader',{name:'Recovered sales',exact:true})).toBeVisible();
 const visibleQuantities=await page.getByRole('spinbutton').evaluateAll(nodes=>nodes.map(n=>Number((n as HTMLInputElement).value)));
 expect(visibleQuantities.length).toBe(350);expect(visibleQuantities.every(q=>q>0)).toBe(true);
 await page.getByRole('button',{name:'High risk · zero qty',exact:true}).click();
 await page.getByPlaceholder('Search store, SKU, product').fill('SKU000539');
 const zeroRow=page.locator('tr[data-row-id="STR068|SKU000539"]');
 await expect(zeroRow.locator('[data-recovered-sales]')).toHaveText('€0');
 await expect(zeroRow.locator('[data-recovered-sales]')).toHaveClass(/text-cockpit-muted/);
 await zeroRow.getByRole('button',{name:'SKU capacity limit',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Why the system recommends 0'})).toBeVisible();
 await expect(page.locator('aside').getByText(/leaves 2 units of room; minimum shipment: 6 units/)).toBeVisible();
 await page.locator('aside').getByRole('button',{name:'Close',exact:true}).click();
 await page.getByPlaceholder('Search store, SKU, product').fill('');
 await page.getByRole('button',{name:'High risk · zero qty',exact:true}).click();
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-results/sportswear-plan.png',fullPage:true});
 await page.getByRole('button',{name:'Model health',exact:true}).click();await expect(page.getByText('Champion: deterministic-v1')).toBeVisible();
});
test('run API validates inputs, authentication, idempotency and rejection',async({request})=>{
 const unauthorized=await request.post('/api/v1/runs',{data:{snapshot:'demo'},headers:{'Idempotency-Key':'unauthorized'}});expect(unauthorized.status()).toBe(401);
 await request.post('/api/session');
 const invalid=await request.post('/api/v1/runs',{data:{snapshot:'demo',scenario:'optimal'},headers:{'Idempotency-Key':'invalid'}});expect(invalid.status()).toBe(400);
 const key=`test-${Date.now()}`;
 const r=await request.post('/api/v1/runs',{data:{snapshot:'demo'},headers:{'Idempotency-Key':key}});expect(r.status()).toBe(202);const run=await r.json();
 let plan;for(let i=0;i<60;i++){const response=await request.get(`/api/v1/runs/${run.id}?limit=1000`);plan=await response.json();if(plan.status==='ready')break;await new Promise(r=>setTimeout(r,100));}
 expect(plan.status).toBe('ready');expect(plan.summary.constraint_violations).toBe(0);expect(plan.plan_id).toBe(run.id);
 const again=await request.post('/api/v1/runs',{data:{snapshot:'demo'},headers:{'Idempotency-Key':key}});expect((await again.json()).id).toBe(run.id);
 const rejected=await request.post(`/api/v1/runs/${run.id}/decision`,{data:{action:'reject',row_ids:[],create_shipping:false,reason:'Browser integration test'}});expect(rejected.ok()).toBe(true);
 const promotion=await request.post('/api/v1/models/fake',{data:{action:'activate',reason:'Unauthorized'}});expect(promotion.status()).toBe(401);
});

test('server override validation, approval, shipping and next-day loop',async({request})=>{
 await request.post('/api/session');
 const r=await request.post('/api/v1/runs',{data:{snapshot:'demo'},headers:{'Idempotency-Key':`approval-${Date.now()}`}});const run=await r.json();
 let plan;for(let i=0;i<60;i++){plan=await(await request.get(`/api/v1/runs/${run.id}?limit=1000`)).json();if(plan.status==='ready')break;await new Promise(r=>setTimeout(r,100));}
 const row=plan.rows.find((x:{finalQty:number})=>x.finalQty>0);expect(row).toBeTruthy();
 const invalid=await request.post(`/api/v1/runs/${run.id}/override`,{data:{revision:0,edits:[{id:row.id,finalQty:1,comment:''}]}});expect(invalid.status()).toBe(400);
 const update=await request.post(`/api/v1/runs/${run.id}/override`,{data:{revision:0,edits:[{id:row.id,finalQty:row.packMultiple,comment:'Review a smaller shipment'}]}});expect(update.ok()).toBe(true);
 const stale=await request.post(`/api/v1/runs/${run.id}/override`,{data:{revision:0,edits:[{id:row.id,finalQty:row.packMultiple,comment:'stale edit'}]}});expect(stale.status()).toBe(409);
 const approval=await request.post(`/api/v1/runs/${run.id}/decision`,{data:{action:'approve',row_ids:[row.id],create_shipping:true,reason:'Test human confirmation'}});expect(approval.ok(),await approval.text()).toBe(true);
 const approved=await approval.json();expect(approved.approval_state).toBe('approved');expect(approved.result.approvedUnits).toBe(row.packMultiple);
 const shipping=await request.get(`/api/v1/runs/${run.id}/shipping`);expect(shipping.ok()).toBe(true);const csv=await shipping.text();expect(csv).toContain('display_product_name');expect(csv).not.toContain('style_color_size');
 const again=await request.post(`/api/v1/runs/${run.id}/decision`,{data:{action:'approve',row_ids:[row.id],create_shipping:true,reason:'retry'}});expect((await again.json()).result.approvalId).toBe(approved.result.approvalId);
 const replay=await request.post('/api/v1/runs',{data:{snapshot:'demo'},headers:{'Idempotency-Key':`replay-${Date.now()}`}});const replayRun=await replay.json();
 let replayPlan;for(let i=0;i<60;i++){replayPlan=await(await request.get(`/api/v1/runs/${replayRun.id}?limit=1000`)).json();if(replayPlan.status==='ready')break;await new Promise(r=>setTimeout(r,100));}
 const repeat=await request.post(`/api/v1/runs/${replayRun.id}/decision`,{data:{action:'approve',row_ids:[row.id],create_shipping:true,reason:'Duplicate inventory snapshot'}});expect(repeat.status()).toBe(409);
 const refresh=await(await request.get('/api/refresh')).json();expect(refresh.runDate).toBe('2026-05-16');expect(refresh.rows.every((x:{finalQty:number})=>x.finalQty===0)).toBe(true);
});

test('planner completes manual override and shipping approval in the UI',async({page})=>{
 await page.goto('/');await page.getByLabel('Data snapshot').selectOption('latest');
 await page.getByRole('button',{name:'Generate recommended plan',exact:true}).first().click();
 await expect(page.getByText('Recommended plan ready. Review exceptions before approval.')).toBeVisible();
 const index=await page.getByRole('spinbutton').evaluateAll(nodes=>nodes.findIndex(n=>Number((n as HTMLInputElement).value)>12));expect(index).toBeGreaterThanOrEqual(0);
 const quantity=page.getByRole('spinbutton').nth(index);const row=quantity.locator('xpath=ancestor::tr');const pack=Number(await row.getAttribute('data-pack-multiple'));
 await quantity.fill(String(pack));await quantity.press('Enter');
 await row.getByPlaceholder('Required').fill('Planner reviewed the synthetic grocery demand');
 await row.getByRole('checkbox').check();
 await page.getByRole('button',{name:'Approve selected',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Confirm replenishment approval'})).toBeVisible();
 await page.getByRole('button',{name:'Confirm',exact:true}).click();
 const downloaded=page.waitForEvent('download');
 await page.getByRole('button',{name:'Yes, create by route and delivery date'}).click();
 const download=await downloaded;expect(download.suggestedFilename()).toContain('shipping-');
 await expect(page.getByRole('heading',{name:'Last approval'})).toBeVisible();
 await expect(page.getByText('Data synced 2026-05-17')).toBeVisible();
});
