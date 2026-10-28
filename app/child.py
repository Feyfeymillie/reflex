"""Module 3: child development as parent guidance. No score, no band, no diagnosis, ever.

Milestones are abbreviated from CDC "Learn the Signs. Act Early." (2022 revision), which lists what
most children (75%) do by each age. Swahili text is a DRAFT for a native speaker to correct.
One fixed rule decides the "talk to your CHW" message (see guidance()).
"""
from datetime import date

AGES = [2, 4, 6, 9, 12, 15, 18, 24, 30, 36]

# age_months: [(code, sw, en)]
MILESTONES = {
    2:  [("DEV_2M_CALMS", "Hutulia akibebwa au akisemeshwa", "Calms down when spoken to or picked up"),
         ("DEV_2M_FACE", "Hukutazama usoni", "Looks at your face"),
         ("DEV_2M_SMILE", "Hutabasamu ukimsemesha", "Smiles when you talk to or smile at them"),
         ("DEV_2M_HEAD", "Huinua kichwa akilazwa kifudifudi", "Holds head up when on tummy")],
    4:  [("DEV_4M_SMILE", "Hutabasamu mwenyewe ili akuvutie", "Smiles on their own to get your attention"),
         ("DEV_4M_COO", "Hutoa sauti kama 'oooo', 'aaaa'", "Makes cooing sounds"),
         ("DEV_4M_HEAD", "Hushikilia kichwa bila msaada akibebwa", "Holds head steady without support when held"),
         ("DEV_4M_HANDS", "Hupeleka mikono mdomoni", "Brings hands to mouth")],
    6:  [("DEV_6M_LAUGH", "Hucheka kwa sauti", "Laughs"),
         ("DEV_6M_KNOWS", "Huwatambua watu wa familia", "Knows familiar people"),
         ("DEV_6M_ROLL", "Hujigeuza kutoka tumbo kwenda mgongo", "Rolls from tummy to back"),
         ("DEV_6M_TURNS", "Hupokezana sauti na wewe", "Takes turns making sounds with you")],
    9:  [("DEV_9M_LEAVE", "Huonyesha hisia ukiondoka", "Reacts when you leave"),
         ("DEV_9M_NAME", "Hugeuka akiitwa jina lake", "Responds to own name"),
         ("DEV_9M_SIT", "Huketi bila kushikiliwa", "Sits without support"),
         ("DEV_9M_BABBLE", "Hutamka 'mamama', 'bababa'", "Makes sounds like 'mamama', 'bababa'")],
    12: [("DEV_12M_WAVE", "Hupunga mkono kuaga", "Waves bye-bye"),
         ("DEV_12M_MAMA", "Humwita mzazi 'mama' au 'baba'", "Calls a parent 'mama' or 'baba'"),
         ("DEV_12M_STAND", "Hujivuta kusimama", "Pulls up to stand"),
         ("DEV_12M_PINCH", "Huokota vitu vidogo kwa kidole gumba na kidole", "Picks up small things with thumb and finger")],
    15: [("DEV_15M_WORDS", "Husema maneno 1-2 zaidi ya mama/baba", "Says 1-2 words besides mama/baba"),
         ("DEV_15M_POINT", "Huonyesha kwa kidole anachotaka", "Points to ask for something"),
         ("DEV_15M_STEPS", "Hupiga hatua chache mwenyewe", "Takes a few steps on their own"),
         ("DEV_15M_SHOW", "Hukuonyesha kitu anachokipenda", "Shows you an object they like")],
    18: [("DEV_18M_POINT", "Huonyesha kwa kidole kitu cha kuvutia", "Points to show you something interesting"),
         ("DEV_18M_WORDS", "Hujaribu kusema maneno 3 au zaidi", "Tries to say three or more words"),
         ("DEV_18M_WALK", "Hutembea bila kushika kitu", "Walks without holding on"),
         ("DEV_18M_FOLLOW", "Hufuata agizo moja bila ishara", "Follows one-step directions without gestures")],
    24: [("DEV_24M_BOOK", "Huonyesha vitu kwenye picha ukimwuliza", "Points to things in a picture when asked"),
         ("DEV_24M_2WORDS", "Huunganisha maneno mawili ('maziwa zaidi')", "Says two words together ('more milk')"),
         ("DEV_24M_KICK", "Hupiga mpira teke", "Kicks a ball"),
         ("DEV_24M_NOTICE", "Hugundua mtu mwingine akiumia au akihuzunika", "Notices when others are hurt or upset")],
    30: [("DEV_30M_50WORDS", "Husema takriban maneno 50", "Says about 50 words"),
         ("DEV_30M_NAMES", "Hutaja vitu kwenye picha ukionyesha", "Names things in a picture when you point"),
         ("DEV_30M_PRETEND", "Hucheza mchezo wa kuigiza (kulisha mdoli)", "Plays simple pretend, like feeding a doll"),
         ("DEV_30M_JUMP", "Huruka kwa miguu yote miwili", "Jumps off the ground with both feet")],
    36: [("DEV_36M_TALK", "Huzungumza nawe kwa kupokezana mara 2 au zaidi", "Has a conversation with at least 2 back-and-forth exchanges"),
         ("DEV_36M_WHY", "Huuliza 'nani', 'nini', 'wapi', 'kwa nini'", "Asks 'who', 'what', 'where' or 'why'"),
         ("DEV_36M_CIRCLE", "Huchora duara ukimwonyesha", "Draws a circle when you show them how"),
         ("DEV_36M_PLAY", "Hujiunga kucheza na watoto wengine", "Notices other children and joins them to play")],
}
ALL_CODES = {c for ms in MILESTONES.values() for c, _, _ in ms}

ACTIVITIES = {
    2:  [("ACT_2M_TALK", "Ongea na mtoto ukimtazama usoni", "Talk to your baby face to face", "Mwimbie, mwige sauti zake. Hii hujenga lugha mapema.", "Sing, copy their sounds. This builds language early."),
         ("ACT_2M_TUMMY", "Muda wa kifudifudi", "Tummy time", "Mlaze kifudifudi akiwa macho dakika chache mara kadhaa kwa siku.", "Lay them on their tummy while awake, a few minutes several times a day.")],
    4:  [("ACT_4M_TOY", "Kitu cha kushika", "Something to grab", "Mpe kitu safi, salama cha kushika na kutikisa (kibuyu kidogo).", "Give a clean, safe thing to hold and shake (a small gourd rattle)."),
         ("ACT_4M_REPLY", "Jibu sauti zake", "Answer their sounds", "Akitoa sauti, jibu kana kwamba mnazungumza.", "When they make a sound, answer as if you're chatting.")],
    6:  [("ACT_6M_PEEK", "Mchezo wa kujificha (peek-a-boo)", "Peek-a-boo", "Funika uso kwa kitenge kisha jitokeze. Hufundisha kwamba vitu vipo hata visipoonekana.", "Cover your face with a cloth then reappear. Teaches that things exist when hidden."),
         ("ACT_6M_NAME", "Taja vitu", "Name things", "Taja vitu anavyovitazama: 'kikombe', 'kuku', 'bibi'.", "Name what they look at: 'cup', 'chicken', 'grandma'.")],
    9:  [("ACT_9M_FLOOR", "Muda sakafuni", "Floor time", "Mweke juu ya mkeka safi apate kujiviringisha, kukaa na kutambaa.", "Put them on a clean mat to roll, sit and crawl."),
         ("ACT_9M_NAMECALL", "Mwite kwa jina", "Call their name", "Mwite kwa jina lake mara nyingi na msifu akigeuka.", "Call their name often and praise them when they turn.")],
    12: [("ACT_12M_WAVE", "Kuaga na kusalimia", "Waving and greeting", "Mwonyeshe kupunga mkono kila mtu anapoondoka au kufika.", "Show them how to wave whenever someone leaves or arrives."),
         ("ACT_12M_CUP", "Vikombe na mawe", "Cups and stones", "Mpe vikombe aweke na kutoa vitu vikubwa salama (si vidogo vya kumeza).", "Let them put large safe objects in and out of cups (nothing small enough to swallow).")],
    15: [("ACT_15M_STORY", "Hadithi fupi", "Short stories", "Msimulie hadithi fupi ukionyesha vitu halisi.", "Tell short stories while pointing to real things."),
         ("ACT_15M_WALK", "Kutembea pamoja", "Walking together", "Mshike mikono atembee, kisha mwache ajaribu mwenyewe.", "Hold their hands to walk, then let them try alone.")],
    18: [("ACT_18M_HELP", "Kazi ndogo za nyumbani", "Small household jobs", "Mwombe akuletee kitu: 'lete kikombe'. Msifu akifanya.", "Ask them to bring you things: 'bring the cup'. Praise them."),
         ("ACT_18M_SONG", "Nyimbo zenye vitendo", "Action songs", "Imbeni nyimbo zenye kupiga makofi na kuonyesha viungo vya mwili.", "Sing songs with clapping and pointing to body parts.")],
    24: [("ACT_24M_PICTURE", "Kuangalia picha", "Looking at pictures", "Angalieni picha (gazeti, kalenda) mumuulize 'ng'ombe yuko wapi?'.", "Look at pictures (newspaper, calendar) and ask 'where is the cow?'."),
         ("ACT_24M_BALL", "Mpira wa nyumbani", "Home-made ball", "Tengeneza mpira kwa mifuko au vitambaa mcheze kupiga teke.", "Make a ball from bags or cloth and play kicking.")],
    30: [("ACT_30M_PRETEND", "Mchezo wa kuigiza", "Pretend play", "Pikeni chakula cha kuigiza kwa vyungu vidogo na majani.", "Cook pretend food with small pots and leaves."),
         ("ACT_30M_CHOICE", "Mpe machaguo", "Give choices", "Muulize 'unataka ndizi au chungwa?' ili ajibu kwa maneno.", "Ask 'banana or orange?' so they answer with words.")],
    36: [("ACT_36M_DRAW", "Kuchora mchangani", "Drawing in the sand", "Chora duara na mistari mchangani kwa kijiti, kisha mpe zamu.", "Draw circles and lines in the sand with a stick, then give them a turn."),
         ("ACT_36M_FRIENDS", "Kucheza na wenzake", "Playing with other children", "Mpe nafasi kucheza na watoto wa jirani kila siku.", "Let them play with neighbours' children every day.")],
}


def age_months(dob, gestation_at_birth_weeks=None, today=None):
    """Age in whole months; corrected for prematurity (<37 weeks) until 24 months."""
    today = today or date.today()
    b = date.fromisoformat(dob)
    m = (today.year - b.year) * 12 + today.month - b.month - (1 if today.day < b.day else 0)
    corrected = False
    if gestation_at_birth_weeks and gestation_at_birth_weeks < 37 and m < 24:
        m -= round((40 - gestation_at_birth_weeks) / 4.345)
        corrected = True
    return max(m, 0), corrected


def band_for(months):
    """The latest milestone age the child has reached (None before 2 months)."""
    reached = [a for a in AGES if a <= months]
    return reached[-1] if reached else None


def _fmt(items):
    return [{"code": c, "sw": sw, "en": en} for c, sw, en in items]


def plan(months):
    """What to ask now: this age's milestones plus the previous age's (to check overdue ones)."""
    cur = band_for(months)
    prev = AGES[AGES.index(cur) - 1] if cur and AGES.index(cur) > 0 else None
    nxt = next((a for a in AGES if a > months), None)
    return {
        "current_age": cur, "previous_age": prev, "next_age": nxt,
        "current": _fmt(MILESTONES.get(cur, [])),
        "previous": _fmt(MILESTONES.get(prev, [])),
        "activities": [{"code": c, "title_sw": tsw, "title_en": ten, "sw": sw, "en": en}
                       for c, tsw, ten, sw, en in ACTIVITIES.get(cur or 2, [])],
    }


def guidance(months, answers, lost_skill):
    """The one fixed rule. answers: {code: 'yes'|'not_yet'}.

    Talk to the CHW if the child has lost a skill they had, or has not yet done a milestone from the
    PREVIOUS age band (i.e. it is overdue by a full step). A not-yet on the current band only gets
    activities: most children reach these milestones by this age, and many reach them a little later.
    """
    p = plan(months)
    prev_codes = {m["code"] for m in p["previous"]}
    overdue = [c for c, v in answers.items() if v == "not_yet" and c in prev_codes]
    practising = [c for c, v in answers.items() if v == "not_yet" and c not in prev_codes]
    advise = bool(lost_skill or overdue)
    return {
        "advise_contact_chw": advise,
        "overdue": overdue,
        "practising": practising,
        "message_sw": ("Ongea na CHW au kliniki kuhusu ukuaji wa mtoto wako. Hii si utambuzi; ni hatua ya kupata ushauri mapema."
                       if advise else "Endelea kucheza na kuongea na mtoto kila siku. Tutaangalia tena kwenye umri unaofuata."),
        "message_en": ("Talk to your CHW or clinic about your child's development. This is not a diagnosis; it's a step to get advice early."
                       if advise else "Keep playing and talking with your child every day. We'll check again at the next age."),
    }


ACTIVITY_CODES = {a[0] for acts in ACTIVITIES.values() for a in acts}
