const fs = require('fs');
const csv = require('csv-parser');

const results = [];

fs.createReadStream('data/whc-sites-2025 (1).csv')
  .pipe(csv())
  .on('data', (data) => {
      const lat = parseFloat(data.latitude);
      const lon = parseFloat(data.longitude);
      if (!isNaN(lat) && !isNaN(lon)) {
          results.push({
              name: data.name_fr || data.name_en,
              lat: lat,
              lon: lon
          });
      }
  })
  .on('end', () => {
      fs.writeFileSync('data/whc-sites.json', JSON.stringify(results));
      console.log('Successfully written ' + results.length + ' sites to JSON.');
  });
