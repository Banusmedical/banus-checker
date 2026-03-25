const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  console.log('Opening page...');
  await page.goto('https://banusmedical.com/staff-check-banus/?run=1', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  console.log('Waiting 20 seconds for JS...');
  await new Promise(r => setTimeout(r, 20000));

  function getAvailableDays() {
    return Array.from(document.querySelectorAll('.os-day[data-date]'))
      .filter(day => {
        const minutes = day.getAttribute('data-bookable-minutes');
        return minutes && minutes.trim() !== '';
      });
  }

  // Merr datat e lira duke naviguar muajt nëse nevojitet
  const slots = await page.evaluate(async () => {
    function sleep(ms) {
      return new Promise(r => setTimeout(r, ms));
    }

    function getAvailableDays() {
      return Array.from(document.querySelectorAll('.os-day[data-date]'))
        .filter(day => {
          const minutes = day.getAttribute('data-bookable-minutes');
          return minutes && minutes.trim() !== '';
        });
    }

    function extractSlots(days) {
      return days.map(day => {
        const date = day.getAttribute('data-date');
        const bookableMinutes = day.getAttribute('data-bookable-minutes');
        const times = bookableMinutes
          ? bookableMinutes.split(',').map(m => {
              const mins = parseInt(m.trim());
              const h = String(Math.floor(mins / 60)).padStart(2, '0');
              const min = String(mins % 60).padStart(2, '0');
              return `${h}:${min}`;
            })
          : [];
        return { date, times };
      });
    }

    let allSlots = [];
    let maxMonths = 3; // maksimum 3 muaj para

    while (allSlots.length < 5 && maxMonths > 0) {
      const days = getAvailableDays();
      const newSlots = extractSlots(days);

      // Shto vetëm datat që nuk i kemi
      for (const slot of newSlots) {
        if (allSlots.length >= 5) break;
        if (!allSlots.find(s => s.date === slot.date)) {
          allSlots.push(slot);
        }
      }

      if (allSlots.length >= 5) break;

      // Kliko shigjetën për muajin tjetër
      const nextBtn = document.querySelector('.os-next-month, .dp-next, [class*="next"]');
      if (!nextBtn) break;

      nextBtn.click();
      await sleep(2000);
      maxMonths--;
    }

    return allSlots.slice(0, 5);
  });

  console.log('Slots found:', JSON.stringify(slots));

  // Dërgo te Make webhook
  const https = require('https');
  const payload = JSON.stringify({ service_id: 74, slots: slots });
  const url = new URL('https://hook.eu1.make.com/tqsosshbd6qsqytijp0g29bp6i68k471');

  const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  await new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      console.log('Webhook status:', res.statusCode);
      resolve();
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  console.log('Done - webhook sent with', slots.length, 'slots');
  await browser.close();
})();
