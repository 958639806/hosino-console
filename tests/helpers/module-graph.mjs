// Parse imports with Node's real ECMAScript parser. Never evaluate module code.
import fs from 'node:fs';import path from 'node:path';import {SourceTextModule} from 'node:vm';
const graph={};
for(const file of process.argv.slice(2))graph[path.resolve(file)]=new SourceTextModule(fs.readFileSync(file,'utf8'),{identifier:file}).dependencySpecifiers;
process.stdout.write(JSON.stringify(graph));
