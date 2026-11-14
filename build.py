import pathlib
src = pathlib.Path(__file__).parent / 'src'
out = pathlib.Path(__file__).parent / 'docs'
html = (src / 'shell.html').read_text()
css = (src / 'style.css').read_text()
js = '\n'.join((src / f).read_text() for f in ['core.js', 'reminders.js', 'screens.js', 'stats.js', 'main.js'])
html = html.replace('/*STYLE*/', css).replace('/*SCRIPT*/', js)
(out / 'index.html').write_text(html)
print('built', len(html), 'bytes')
