const sharp = require('sharp');
const fs = require('fs');

// Convert SVG to PNG
const svgBuffer = fs.readFileSync('./public/favicon.svg');

sharp(svgBuffer)
  .resize(512, 512)
  .png()
  .toFile('./public/appicon.png')
  .then(() => {
    console.log('Converted favicon.svg to appicon.png (512x512)');
    
    // Also create favicon.png at 32x32 for browsers
    return sharp(svgBuffer)
      .resize(32, 32)
      .png()
      .toFile('./public/favicon.png');
  })
  .then(() => {
    console.log('Created favicon.png (32x32)');
  })
  .catch(err => {
    console.error('Error converting SVG:', err);
    process.exit(1);
  });
