const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  const afterDate = process.env.AFTER_DATE || new Date().toISOString().split('T')[0];
  console.log('Looking for dates after:', afterDate);

  console.log('Opening page...');
  await page.goto('https://banusmedical.com/staff-check-banus/?run=1', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await new Promise(r => setTimeout(r, 2000));

  const slots = await page.evaluate(async (afterDate) => {
    function sleep(ms) {
      return new Promise(r => setTimeout(r, ms));
    }

    function getAvailableDays() {
      return Array.from(document.querySelectorAll('.os-day[data-date]'))
        .filter(day => {
          const minutes = day.getAttribute('data-bookable-minutes');
          const date = day.getAttribute('data-date');
          return minutes && minutes.trim() !== '' && date > afterDate;
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

    // HAPI 1: Kliko shërbimin
    await new Promise((resolve) => {
      const interval = setInterval(() => {
        const services = Array.from(document.querySelectorAll('.os-item, .os-service-item'));
        if (services.length > 0) {
          clearInterval(interval);
          let found = false;
          services.forEach(service => {
            const text = service.innerText || '';
            if (text.includes('Solicitud de cita')) {
              console.log('🟢 Clicking service');
              service.click();
              found = true;
            }
          });
          if (!found) {
            console.warn('⚠️ Clicking first service');
            services[0].click();
          }
          resolve();
        }
      }, 500);
    });

    // HAPI 2: Prit kalendarin
    await new Promise((resolve) => {
      const interval = setInterval(() => {
        const days = document.querySelectorAll('.os-day[data-date]');
        if (days.length > 0) {
          clearInterval(interval);
          console.log('📆 Calendar loaded');
          resolve();
        }
      }, 800);
    });

    await sleep(1500);

    // HAPI 3: Navigo te muaji i dates se kerkuar
    let maxNav = 12;
    while (maxNav > 0) {
      const allDays = Array.from(document.querySelectorAll('.os-day[data-date]'));
      const lastDay = allDays[allDays.length - 1];
      if (!lastDay) break;
      const lastDate = lastDay.getAttribute('data-date');
      if (lastDate > afterDate) break;

      const nextBtn = document.querySelector('.os-next-month, .dp-next, [data-action="next"], .fc-next-button, button[aria-label="Next month"]');
      if (!nextBtn) break;
      console.log('➡️ Navigating to next month...');
      nextBtn.click();
      await sleep(2000);
      maxNav--;
    }

    await sleep(1000);

    // HAPI 4: Merr 5 datat e lira pas afterDate
    let allSlots = [];
    let maxMonths = 3;

    while (allSlots.length < 5 && maxMonths > 0) {
      const days = getAvailableDays();
      const newSlots = extractSlots(days);

      for (const slot of newSlots) {
        if (allSlots.length >= 5) break;
        if (!allSlots.find(s => s.date === slot.date)) {
          allSlots.push(slot);
        }
      }

      if (allSlots.length >= 5) break;

      const nextBtn = document.querySelector('.os-next-month, .dp-next, [data-action="next"], .fc-next-button, button[aria-label="Next month"]');
      if (!nextBtn) break;
      console.log('➡️ Going to next month for more slots...');
      nextBtn.click();
      await sleep(2500);
      maxMonths--;
    }

    return allSlots.slice(0, 5);
  }, afterDate);

  console.log('Slots found:', JSON.stringify(slots));

  // Dergo webhook dhe mbyll menjëherë
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

  console.log('Done - sent', slots.length, 'slots');
  process.exit(0);
})();
