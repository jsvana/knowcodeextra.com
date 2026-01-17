#!/usr/bin/env node
/**
 * Certificate Generator for KnowCodeExtra
 * 
 * Generates PDF certificates for 20 WPM Extra Class from the SVG template.
 * 
 * Usage:
 *   node generate-certificate.js --callsign W6JSV
 *   node generate-certificate.js --callsign W6JSV --date "January 17, 2025" --cert-no "20WPM-ABC123"
 * 
 * Requirements:
 *   npm install puppeteer commander
 */

const fs = require('fs');
const path = require('path');
const { program } = require('commander');

program
  .requiredOption('-c, --callsign <callsign>', 'Amateur radio callsign')
  .option('-d, --date <date>', 'Date to display', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))
  .option('-n, --cert-no <number>', 'Certificate number')
  .option('-o, --output <path>', 'Output PDF path', 'certificate.pdf')
  .option('--svg-only', 'Output SVG instead of PDF')
  .parse();

const options = program.opts();

// Generate certificate number if not provided
const certNo = options.certNo || `20WPM-${Date.now().toString(36).toUpperCase()}`;

async function generateCertificate() {
  // Read the template
  const templatePath = path.join(__dirname, 'certificate-template.svg');
  let svg = fs.readFileSync(templatePath, 'utf-8');
  
  // Replace placeholders (only callsign, date, and cert number - speed and level are hardcoded)
  svg = svg.replace(/\{\{CALLSIGN\}\}/g, options.callsign.toUpperCase());
  svg = svg.replace(/\{\{DATE\}\}/g, options.date);
  svg = svg.replace(/\{\{CERT_NO\}\}/g, certNo);
  
  if (options.svgOnly) {
    // Output SVG
    const outputPath = options.output.replace('.pdf', '.svg');
    fs.writeFileSync(outputPath, svg);
    console.log(`✓ SVG certificate saved to: ${outputPath}`);
    return;
  }
  
  // Generate PDF using Puppeteer
  const puppeteer = require('puppeteer');
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap');
        body { margin: 0; padding: 0; }
      </style>
    </head>
    <body>
      ${svg}
    </body>
    </html>
  `;
  
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  await page.pdf({
    path: options.output,
    width: '800px',
    height: '600px',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });
  
  await browser.close();
  
  console.log(`✓ Know-Code Extra certificate generated!`);
  console.log(`  Callsign: ${options.callsign.toUpperCase()}`);
  console.log(`  Date: ${options.date}`);
  console.log(`  Certificate #: ${certNo}`);
  console.log(`  Output: ${options.output}`);
}

generateCertificate().catch(err => {
  console.error('Error generating certificate:', err);
  process.exit(1);
});
