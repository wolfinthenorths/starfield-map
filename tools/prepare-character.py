"""Keep the original Fallout frames and pivots; export only idle + walk.
Source: Kalima-Entertainment/Fallout_Strategy, Assets.zip, VaultDwellers_Melee.
Four original directions, eight walking frames and a neutral standing frame.
"""
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
src=Image.open(root.parent/'sprites/VaultDwellers_Melee.png').convert('RGBA')
out=Image.new('RGBA',(64*9,88*4))
for direction in range(4):
 for frame,col in enumerate([*range(19,27),10]):
  tile=src.crop((col*128+32,direction*128+40,col*128+96,direction*128+128))
  pixels=tile.load()
  for y in range(tile.height):
   for x in range(tile.width):
    r,g,b,a=pixels[x,y]
    if max(r,g,b)<22 and a:pixels[x,y]=(r,g,b,round(a*.3))
  out.alpha_composite(tile,(frame*64,direction*88))
out.save(root/'assets/resident-cut.png')
print('Prepared original sprite: four directions, 8 walk frames + idle, 576×352.')
