const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  console.log('Opening page...');
  await page.goto('https://banusmedical.com/staff-check-banus/?run=1', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  console.log('Waiting for JS to execute...');
  await new Promise(r => setTimeout(r, 15000));

  console.log('Done - webhook should have been sent');
  await browser.close();
})();
