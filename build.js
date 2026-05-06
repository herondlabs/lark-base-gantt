const esbuild = require('esbuild');
const fs = require('fs');

async function build() {
  console.log('Bundling src/main.js...');
  const result = await esbuild.build({
    entryPoints: ['src/main.js'],
    bundle: true,
    format: 'iife',
    minify: true,
    write: false,
  });

  const bundle = result.outputFiles[0].text;
  const template = fs.readFileSync('index.template.html', 'utf8');
  const final = template.replace('<!-- BUNDLE -->', () => bundle);
  fs.writeFileSync('index.html', final);

  const kb = Math.round(Buffer.byteLength(final) / 1024);
  console.log(`✓ index.html built (${kb} KB)`);
}

build().catch(e => { console.error(e); process.exit(1); });
