# Builds the Legless Lizard and Eight Legged Octopus packs from the PDF text (decks.pdf) and writes them into seed/ and data/ packs.json.
import json, re, subprocess, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = sys.argv[1] if len(sys.argv) > 1 else '/workspace/whyme-input/decks.pdf'
raw = subprocess.run(['pdftotext', PDF, '-'], capture_output=True, text=True).stdout.replace('\u200b', '')
lz, oc = raw.split('Legless Lizard', 1)[1].split('Eight Legged Octopus')
def cards(block, titles):
    # The PDF numbering is detached from the text, so split on the known card titles in order.
    text = re.sub(r'^\s*\d+\.\s*$', '', block, flags=re.M)
    text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.M)
    text = re.sub(r'\s*\n\s*', ' ', text).strip()
    out = []; pos = 0
    for i, t in enumerate(titles):
        a = text.index(t, pos)
        b = text.index(titles[i + 1], a + len(t)) if i + 1 < len(titles) else len(text)
        out.append(text[a:b].strip()); pos = b
    return out
FIX = {
  'If there is snow outside it can also be.': 'If there is snow outside, snow works too.',
  'Stay for 8 seconds in a bowl with cold water and ice.': 'Stand in a bowl of cold water and ice for 8 seconds.',
}
def split(t):
    for a, b in FIX.items(): t = t.replace(a, b)
    m = re.match(r'^((?:DUO CARD: )?[^!?]+[!?])\s+(.*)$', t)
    return m.group(1), m.group(2)
DUO_INFO_SW = ('DUO card: there are two copies of this card in the deck. Whoever draws the first copy keeps it in mind and taps done; the game goes on. '
  'When someone draws the second copy, both of you play together, and the second player taps done or failed for the pair. '
  'Say the Same Word: on a count of three, both say one word at the same time. Each next word must be a real association with the two words just said. Keep going until you both say the same word.')
DUO_INFO_WP = ('DUO card: there are two copies of this card in the deck. Whoever draws the first copy keeps it in mind and taps done; the game goes on. '
  'When someone draws the second copy, both of you do the challenge together, and the second player taps done or failed for the pair.')
ROUND = ' A round is one full turn of the table: it ends when it is your turn to draw again.'
L = {
 'Picture Perfect!': (180, 'The group picks any picture, for example a famous painting or a photo on a phone. Recreate it with your body, people and objects around you. The group judges.'),
 'Make Them Laugh!': (180, 'Everyone keeps the water in their mouth until they laugh or the time runs out. You need 4 people to spit or swallow while laughing.'),
 'Human Canvas!': (None, 'The group shows you a picture your partner cannot see. Describe it with words only while your partner draws it on your back with a finger. Then they redraw what they felt on paper, and the group decides if it matches.'),
 'Sock Snatcher!': (30, None),
 'Marco Polo!': (300, 'Everyone else hides while you count with your eyes closed. Start the timer when you shout "I\'m coming!". Find all of them to succeed.'),
 'Upside-Down Quiz!': (5, 'The timer is for the 5 seconds upside down (a handstand against a wall or hanging off the sofa both count). Then the group, starting with the person on your left, asks you 4 quick questions. Answer at least 2 correctly.'),
 'Safe Seeker!': (180, 'Everyone else hides. Each person you find within 3 minutes takes a shot. You are never penalised on this card unless you refuse to seek.'),
 'Human Charades!': (180, 'Act out the four words so the group guesses the whole phrase. Any sound you make costs you a shot.'),
 'Lost in Translation!': (180, 'Mime, mouth or point, but the listener cannot hear. They must say the full sentence back to succeed.'),
 'Wikipedia Race!': (120, 'Open the Wikipedia article for the start word. You may only click links inside articles: no search box, no typing the address. Reach the target article within the time.'),
 'Name That Tune!': (None, 'The group plays or hums short parts of songs. Each answer must come within 5 seconds. Get at least half right. No overall timer.'),
 'Blind Art Detective!': (None, 'Keep your eyes closed while you describe and while the others draw. Then open them and guess who drew each picture.'),
 'Fashion Model!': (180, 'The 3 minute timer is for getting dressed. The photoshoot afterwards has no time limit.'),
 'Time for a Shave!': (None, 'Only if you agree to it. If you refuse, take the penalty.'),
 'Dance Pro!': (180, 'The timer is for the 3 minutes of teaching in the other room. The performance afterwards is not timed.'),
 'Blind as a Bat!': (None, 'Cover your eyes with a scarf or a sleep mask.' + ROUND + ' Keep playing your own cards blind; someone reads them out for you.'),
 'Hands Tied!': (None, 'Tie your hands together with a scarf or belt.' + ROUND),
 'Drinking Parrot!': (None, 'This lasts until the end of the game.'),
 'Tequila Mode!': (None, ROUND.strip()),
}
O = {
 'Titanic Scene!': (None, 'Look up the "I\'m Flying" scene on YouTube first. You play Rose, the other person plays Jack.'),
 'Song Battle!': (None, 'Go around the table: each player says a word, everyone else races to sing a real song that contains it. The last one to sing in each round drinks.'),
 'Back Drawing!': (180, 'They draw with a finger, slowly, one picture only. You may ask them to repeat it once.'),
 "Who's the Impostor?": (None, 'One player outside the game (or a phone app) secretly tells two of you a character; the third person is told only that they are the impostor. Take turns saying one word about the character. After 4 rounds of words, all point at the impostor. If you find them, the card is done.'),
 'Cheeto Challenge!': (None, 'Stand 3 to 5 metres away and throw one at a time. One catch in 5 attempts is a success.'),
 'Belly Race!': (None, 'Both start lying down with hands clasped behind your back. First to reach the cheesy puff wins. If you lose, the card is failed.'),
 'Horror Movie Script!': (None, 'Use one sheet of paper with one box per player. You draw scene 1 and the title. Pass the paper to the player who had their turn before you, and keep passing backwards around the table until every box has a scene. Then read the story out loud.'),
 'Where Am I?': (300, 'The group may only say "hot" (closer) or "cold" (further). When you reach the spot, take the pose. Done if you get both right within the time.'),
 'Blind Foot Fight!': (None, 'Sit facing each other, eyes closed. The first to touch the other person\'s foot with their own foot wins.'),
 'Dance Battle!': (60, 'The timer covers both dancers: 30 seconds for you, then 30 seconds for the person opposite. The judges are everyone else.'),
 'DUO CARD: Weird Positions!': (None, DUO_INFO_WP + ' The other players pick three poses from a Pinterest search for "weird positions".'),
 'Left-Handed Life!': (None, 'Use only your left hand for everything, including drinking.' + ROUND + ' If you are left-handed, use only your right hand.'),
 'Attached at the Back!': (None, 'Tie yourselves together with a scarf or belt.' + ROUND),
 'TikTok Time!': (None, 'Record it on a phone and show the group.'),
 'Happy Feet!': (8, 'Both feet in, for 8 seconds. Start the timer once your feet are in the water.'),
 'Legs Tied!': (None, ROUND.strip()),
 "Can't Hear You!": (None, 'Wear headphones with loud music or earplugs.' + ROUND),
 'Joined at the Leg!': (None, 'Tie your ankle to theirs with a scarf or belt.' + ROUND),
}
def build(block, prefix, meta, duo_title, duo_info, titles):
    out = []; n = 0
    for t in cards(block, titles):
        title, body = split(t)
        n += 1
        c = {'id': f'{prefix}{n:02d}', 'title': title, 'text': body}
        tm, info = meta.get(title, (None, None))
        if title == duo_title:
            c['duo'] = True
            if duo_info: info = duo_info
        if tm: c['timeSeconds'] = tm
        if info: c['info'] = info
        out.append(c)
    return out
LT = ['Clothing Swap!','Picture Perfect!','Make Them Laugh!','Human Canvas!','Sock Snatcher!','Marco Polo!','Upside-Down Quiz!','Safe Seeker!','Human Charades!','Lost in Translation!','Wikipedia Race!','DUO CARD: Same Word!','DUO CARD: Same Word!','Name That Tune!','Blind Art Detective!','Fashion Model!','Time for a Shave!','The Lion Sleeps Tonight!','Dance Pro!','A Shot to Wake You Up!','Blind as a Bat!','Hands Tied!','Drinking Parrot!','Tequila Mode!']
OT = ['Titanic Scene!','What a Mess!','Zorba Time!','Song Battle!','Back Drawing!',"Who's the Impostor?",'DUO CARD: Weird Positions!','DUO CARD: Weird Positions!','Cheeto Challenge!','Belly Race!','Horror Movie Script!','Choir Time!','Where Am I?','Blind Foot Fight!','Dance Battle!','A Shot to Wake You Up!','Left-Handed Life!','Attached at the Back!','TikTok Time!','Happy Feet!','Legs Tied!',"Can't Hear You!",'Joined at the Leg!']
lizard = build(lz, 'll', L, 'DUO CARD: Same Word!', DUO_INFO_SW, LT)
octo = build(oc, 'eo', O, 'DUO CARD: Weird Positions!', None, OT)
assert len(lizard) == 24 and len(octo) == 23, (len(lizard), len(octo))
PEN = ['Drink 3 shots.']
new = [
 {'id': 'legless-lizard', 'name': 'Legless Lizard', 'description': 'Party challenges for brave players: races, dares, duets and drinks.', 'image': '/packs/legless-lizard.png', 'published': True, 'cards': lizard, 'penalties': PEN},
 {'id': 'eight-legged-octopus', 'name': 'Eight Legged Octopus', 'description': 'Group scenes, battles, ties and duo cards. Bring friends and a scarf.', 'image': '/packs/eight-legged-octopus.png', 'published': True, 'cards': octo, 'penalties': PEN},
]
for f in ['seed/packs.json', 'data/packs.json']:
    p = os.path.join(ROOT, f)
    if not os.path.exists(p): continue
    packs = json.load(open(p))
    packs = [x for x in packs if x['id'] not in ('legless-lizard', 'eight-legged-octopus')]
    for x in packs:
        if x['id'] in ('creative-crab', 'quick-fire'): x['published'] = False
    packs = new + packs
    json.dump(packs, open(p, 'w'), indent=2, ensure_ascii=False); open(p, 'a').write('\n')
    print('wrote', f)
for c in lizard + octo: print(c['id'], c.get('timeSeconds', '-'), 'I' if 'info' in c else ' ', c['title'], '|', c['text'][:70])
