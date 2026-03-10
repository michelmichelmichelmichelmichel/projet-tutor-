const fs = require('fs');
const csv = require('csv-parser');

const inputFile = './ZIP INSEE lits/DS_TOUR_CAP_2026_data.csv';
const outputFile = './data/insee_data.json';

// Structure souhaitée:
// {
//   "CODE_INSEE": {
//     "total_loc": 0, // Nb d'établissements total
//     "hotel_beds": 0,
//     "camping_beds": 0,
//     "collective_beds": 0,
//     "hotel_stars": { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "NC": 0 },
//     "camping_stars": { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "NC": 0 }
//   }
// }

const data = {};

console.log('Lecture du fichier CSV INSEE...');

fs.createReadStream(inputFile)
    .pipe(csv({ separator: ';' }))
    .on('data', (row) => {
        // "GEO";"GEO_OBJECT";"ACTIVITY";"UNIT_LOC_RANKING";"L_STAY";"TOUR_MEASURE";"FREQ";"OBS_STATUS";"TIME_PERIOD";"OBS_VALUE"
        const geo = row['GEO'];
        const geoObject = row['GEO_OBJECT'];
        if (!geo) return; // Ignore les lignes vides/anormales

        // IMPORTANT: Ne garder que les lignes au niveau COMMUNE (GEO_OBJECT === "COM")
        // pour éviter le double-comptage avec les bassins de vie (BV2022), etc.
        if (geoObject !== 'COM') return;
        
        if (!data[geo]) {
            data[geo] = {
                total_loc: 0,
                hotel_beds: 0,
                camping_beds: 0,
                collective_beds: 0,
                hotel_stars: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "NC": 0 },
                camping_stars: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "NC": 0 }
            };
        }

        const activity = row['ACTIVITY'];
        const ranking = row['UNIT_LOC_RANKING'];
        const measure = row['TOUR_MEASURE'];
        const value = parseInt(row['OBS_VALUE'], 10) || 0;

        // 1. Total d'établissements — I552 est déjà le total de I552A+I552B+I552C
        if (measure === 'UNIT_LOC' && ranking === '_T' && ['I551', 'I552', 'I553'].includes(activity)) {
            data[geo].total_loc += value;
        }

        // 2. Lits Hôtels = chambres (PLACE) * 2
        // Dans le jeu de données INSEE, pour I551, PLACE correspond au nombre de chambres.
        if (activity === 'I551' && measure === 'PLACE' && ranking === '_T') {
            data[geo].hotel_beds += value * 2;
        }

        // 3. Lits Campings = emplacements (PLACE) * 3
        // Pour I553, PLACE correspond au nombre d'emplacements.
        if (activity === 'I553' && measure === 'PLACE' && ranking === '_T') {
            data[geo].camping_beds += value * 3;
        }

        // 4. Lits Collectifs — I552 est déjà le TOTAL de I552A + I552B + I552C
        // On ne prend QUE I552 pour éviter le double-comptage
        if (activity === 'I552' && measure === 'BEDPLACE' && ranking === '_T') {
             data[geo].collective_beds += value;
        }

        // 5. Répartition par étoiles Hôtels
        if (activity === 'I551' && measure === 'UNIT_LOC' && ranking !== '_T') {
            if (data[geo].hotel_stars[ranking] !== undefined) {
                data[geo].hotel_stars[ranking] += value;
            }
        }

        // 6. Répartition par étoiles Campings
        if (activity === 'I553' && measure === 'UNIT_LOC' && ranking !== '_T') {
            if (data[geo].camping_stars[ranking] !== undefined) {
                data[geo].camping_stars[ranking] += value;
            }
        }
    })
    .on('end', () => {
        console.log(`Lecture terminée. ${Object.keys(data).length} zones traitées.`);
        
        // Créer le dossier data s'il n'existe pas
        if (!fs.existsSync('./data')){
            fs.mkdirSync('./data');
        }

        fs.writeFileSync(outputFile, JSON.stringify(data));
        console.log(`Fichier ${outputFile} généré avec succès. (${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(2)} MB)`);
    });
