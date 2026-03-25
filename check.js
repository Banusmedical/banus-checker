const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Shfaq të gjitha console.log nga faqja
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  console.log('Opening page...');
  await page.goto('https://banusmedical.com/staff-check-banus/?run=1', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  console.log('Waiting 20 seconds for JS...');
  await new Promise(r => setTimeout(r, 20000));

  console.log('Done');
  await browser.close();
})();
