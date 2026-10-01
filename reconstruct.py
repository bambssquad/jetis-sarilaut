#!/usr/bin/env python3
"""Reproduce the verified Jetis Sarilaut site using pinned public source assets."""
import argparse,hashlib,json,pathlib,shutil,subprocess,tarfile
parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);parser.add_argument('--output',default='dist');args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parent;source=pathlib.Path(args.source).resolve();output=pathlib.Path(args.output).resolve();manifest=json.loads((root/'build-manifest.json').read_text())
actual_commit=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
assert actual_commit==manifest['source_commit'],f'Source revision mismatch: {actual_commit}'
archive=root/'overlay.tar.gz';assert hashlib.sha256(archive.read_bytes()).hexdigest()==manifest['overlay_sha256'],'Overlay checksum mismatch'
assert not output.exists(),f'Refusing to replace an existing output directory: {output}'
output.mkdir(parents=True)
def safe_path(base,name):
 result=(base/name).resolve();assert result.is_relative_to(base) and result!=base,f'Unsafe path: {name}';return result
for entry in manifest['files']:
 if 'source_path' in entry:
  target=safe_path(output,entry['path']);target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(safe_path(source,entry['source_path']),target)
with tarfile.open(archive,'r:gz') as tar:
 for member in tar.getmembers():
  assert member.isfile(),f'Unsupported archive entry: {member.name}'
  target=safe_path(output,member.name);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(tar.extractfile(member).read())
script="""import {readFileSync,writeFileSync} from 'node:fs';import {pathToFileURL} from 'node:url';const [compiler,input,output]=process.argv.slice(1);const {compileGeometry}=await import(pathToFileURL(compiler));const data=JSON.parse(readFileSync(input,'utf8').replace(/^\\uFEFF/,''));writeFileSync(output,JSON.stringify(compileGeometry(data)));"""
subprocess.run(['node','--input-type=module','-e',script,str(output/'source/geometry.mjs'),str(source/'analysis/geometry.json'),str(output/'source/scene.json')],check=True)
expected={e['path'] for e in manifest['files']};actual={p.relative_to(output).as_posix() for p in output.rglob('*') if p.is_file()};assert actual==expected,f'File set mismatch: {actual^expected}'
for entry in manifest['files']:
 data=safe_path(output,entry['path']).read_bytes();assert len(data)==entry['bytes'],f"Size mismatch: {entry['path']}";assert hashlib.sha256(data).hexdigest()==entry['sha256'],f"SHA256 mismatch: {entry['path']}"
print(f'VERIFIED: {len(expected)} files, {sum(e["bytes"] for e in manifest["files"]):,} bytes; every file exactly matches the validated site.')
