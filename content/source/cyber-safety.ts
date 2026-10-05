import type { SourceLesson } from './types.ts';

/** Cyber safety track (free, ages 8+). Hebrew avoids gendered second person: plural forms throughout. */
export const CYBER_SAFETY: SourceLesson[] = [
  {
    id: 'cyber-01',
    version: 1,
    intro: [
      {
        he: 'סיסמה היא המפתח לחשבונות שלכם. מי שיודע אותה יכול להיכנס, לשחק במקומכם ואפילו לשנות דברים.',
        en: 'A password is the key to your accounts. Anyone who knows it can get in, play as you and even change things.',
      },
      {
        he: "הסיסמאות הכי חזקות הן ארוכות. אפשר לחבר כמה מילים אקראיות למשפט מצחיק, למשל 'דרקון סגול אוכל פיצה על הירח'.",
        en: "The strongest passwords are long. You can join a few random words into a funny phrase, like 'purple dragon eats pizza on the moon'.",
      },
      {
        he: 'סיסמה טובה היא גם סודית ושונה בכל חשבון. רק אתם וההורים יודעים אותה.',
        en: 'A good password is also secret and different for every account. Only you and your parents know it.',
      },
    ],
    game: {
      prompt: { he: 'מיינו כל סיסמה: חזקה או חלשה?', en: 'Sort each password: strong or weak?' },
      bins: [
        { id: 'strong', label: { he: 'חזקה', en: 'Strong' } },
        { id: 'weak', label: { he: 'חלשה', en: 'Weak' } },
      ],
      items: [
        {
          id: 'numbers',
          bin: 'weak',
          text: { he: '123456', en: '123456' },
          explain: {
            he: 'זו אחת הסיסמאות הנפוצות בעולם. מחשב מנחש אותה תוך שנייה.',
            en: "It's one of the most common passwords in the world. A computer guesses it in a second.",
          },
        },
        {
          id: 'four_words',
          bin: 'strong',
          text: { he: 'ענן כתום רוקד עם מטרייה', en: 'orange cloud dances with umbrella' },
          explain: {
            he: 'ארבע מילים אקראיות יוצרות סיסמה ארוכה שקשה לנחש וקל לזכור.',
            en: "Four random words make a long password that's hard to guess and easy to remember.",
          },
        },
        {
          id: 'pet_name',
          bin: 'weak',
          text: { he: 'השם של הכלב שלכם', en: "Your dog's name" },
          explain: {
            he: 'חברים ואנשים ברשת יכולים לדעת את השם הזה או לנחש אותו.',
            en: 'Friends and people online may know that name or guess it.',
          },
        },
        {
          id: 'long_sentence',
          bin: 'strong',
          text: { he: 'הצב שלי רץ מהר יותר מאוטובוס כחול', en: 'my turtle runs faster than a blue bus' },
          explain: {
            he: 'משפט ארוך ומשונה הוא סיסמה חזקה, כל עוד לא משתפים אותו.',
            en: "A long, odd sentence is a strong password, as long as you don't share it.",
          },
        },
        {
          id: 'password1',
          bin: 'weak',
          text: { he: 'password1', en: 'password1' },
          explain: {
            he: 'מילה מוכרת עם מספר בסוף היא מהניחושים הראשונים של פורצים.',
            en: 'A common word with a number at the end is one of the first things attackers try.',
          },
        },
        {
          id: 'same_everywhere',
          bin: 'weak',
          text: {
            he: 'סיסמה ארוכה וטובה, אבל אותה אחת בכל המשחקים',
            en: 'A long, good password, but the same one in every game',
          },
          explain: {
            he: 'אם משחק אחד נפרץ, כל החשבונות האחרים בסכנה. לכל חשבון סיסמה משלו.',
            en: 'If one game gets hacked, all your other accounts are at risk. Every account gets its own password.',
          },
        },
      ],
    },
    quiz: [
      {
        id: 'strongest',
        answer: 0,
        question: { he: 'איזו סיסמה הכי חזקה?', en: 'Which password is the strongest?' },
        options: {
          he: ['חתול ירוק שותה מיץ על הגג', 'abc123', 'תאריך יום ההולדת שלכם'],
          en: ['green cat drinks juice on the roof', 'abc123', 'Your birthday'],
        },
        explain: {
          he: 'כמה מילים אקראיות ביחד יוצרות סיסמה ארוכה וקשה לניחוש.',
          en: "A few random words together make a long password that's hard to guess.",
        },
      },
      {
        id: 'reuse',
        answer: 1,
        question: { he: 'למה לא משתמשים באותה סיסמה בכל מקום?', en: 'Why not use the same password everywhere?' },
        options: {
          he: ['כי זה משעמם', 'כי אם היא נחשפת במקום אחד, כל החשבונות בסכנה', 'כי המחשב מתבלבל'],
          en: ["Because it's boring", 'Because if it leaks in one place, every account is at risk', 'Because the computer gets confused'],
        },
        explain: {
          he: 'סיסמה שונה לכל חשבון שומרת על השאר, גם אם אחד נפרץ.',
          en: 'A different password for each account keeps the rest safe, even if one is hacked.',
        },
      },
      {
        id: 'share',
        answer: 2,
        question: {
          he: 'חבר טוב מבקש את הסיסמה שלכם למשחק. מה עושים?',
          en: 'A good friend asks for your game password. What do you do?',
        },
        options: {
          he: ['משתפים, חברים משתפים הכול', 'משתפים רק אם מבטיחים לשמור בסוד', 'לא משתפים. את הסיסמה יודעים רק אתם וההורים'],
          en: ['Share it, friends share everything', 'Share it only if they promise to keep it secret', "Don't. Only you and your parents know it"],
        },
        explain: {
          he: 'גם חברים טובים לא צריכים את הסיסמה. ככה החשבון נשאר רק שלכם.',
          en: "Even good friends don't need your password. That way the account stays yours.",
        },
      },
    ],
    summary: {
      he: 'סיסמה חזקה היא ארוכה, למשל כמה מילים אקראיות ביחד. היא שונה בכל חשבון, ואותה יודעים רק אתם וההורים.',
      en: "A strong password is long, like a few random words together. It's different for every account, and only you and your parents know it.",
    },
  },
  {
    id: 'cyber-02',
    version: 1,
    intro: [
      {
        he: 'הודעת פישינג היא הודעה מזויפת שמתחזה למישהו שסומכים עליו, כמו חברת משחקים, בנק או חבר.',
        en: 'Phishing is a fake message that pretends to come from someone you trust, like a game company, a bank or a friend.',
      },
      {
        he: 'היא מנסה לגרום ללחוץ על קישור, למסור סיסמה או למהר. הלחץ למהר הוא רמז גדול!',
        en: 'It tries to make you click a link, hand over a password or hurry. Hurrying you is a big clue!',
      },
      {
        he: 'רמזים שכדאי לחפש: לחץ ודחיפות, בקשה לסיסמה או לקוד, פרס שנשמע טוב מדי, וקישורים מוזרים או שגיאות כתיב.',
        en: 'Clues to look for: rushing, asking for passwords or codes, prizes that sound too good to be true, and strange links or spelling.',
      },
    ],
    game: {
      prompt: {
        he: 'מיינו כל הודעה: נראית בטוחה או חשודה?',
        en: 'Sort each message: does it look safe or suspicious?',
      },
      practiceNotice: {
        he: 'אלה הודעות אימון שהמצאנו בשביל המשחק. הן לא אמיתיות.',
        en: 'These are practice messages we made up for this game. They are not real.',
      },
      bins: [
        { id: 'safe', label: { he: 'נראית בטוחה', en: 'Looks safe' } },
        { id: 'suspicious', label: { he: 'חשודה', en: 'Suspicious' } },
      ],
      items: [
        {
          id: 'urgent_delete',
          bin: 'suspicious',
          text: {
            he: 'דחוף! החשבון שלך במשחק יימחק בעוד שעה. שלחו את הסיסמה כדי לשמור עליו.',
            en: 'URGENT! Your game account will be deleted in 1 hour. Send your password to keep it.',
          },
          explain: {
            he: 'חברות אמיתיות אף פעם לא מבקשות סיסמה, והלחץ למהר הוא תרגיל.',
            en: 'Real companies never ask for your password, and rushing you is a trick.',
          },
        },
        {
          id: 'mom_pickup',
          bin: 'safe',
          text: { he: 'אמא: אני אוספת אותך מהספרייה בארבע.', en: "Mom: I'm picking you up from the library at 4." },
          explain: {
            he: 'הודעה רגילה ממישהי מוכרת, בלי בקשה לשום דבר סודי. אם משהו מרגיש מוזר, תמיד אפשר להתקשר ולבדוק.',
            en: 'A normal message from someone you know, asking for nothing secret. If anything feels off, you can always call and check.',
          },
        },
        {
          id: 'free_coins',
          bin: 'suspicious',
          text: {
            he: 'מזל טוב! זכית ב־10,000 מטבעות בחינם! לחצו כאן והכניסו שם משתמש וסיסמה כדי לקבל אותם.',
            en: 'Congratulations! You won 10,000 free coins! Click here and enter your username and password to claim them.',
          },
          explain: {
            he: 'פרס שלא נרשמת אליו, וגם בקשה לפרטי כניסה, הם רמזים גדולים.',
            en: 'A prize you never entered for, plus a request for your login, are big clues.',
          },
        },
        {
          id: 'code_back',
          bin: 'suspicious',
          text: {
            he: 'חבר שמכירים רק מהמשחק: שלחתי לך קוד בטעות, אפשר לשלוח לי אותו בחזרה?',
            en: 'A friend you only know from a game: I sent you a code by mistake, can you send it back to me?',
          },
          explain: {
            he: 'קוד הוא כמו מפתח. מי שמבקש קוד שקיבלת מנסה להיכנס לחשבון שלך.',
            en: 'A code is like a key. Someone asking for a code you received is trying to get into your account.',
          },
        },
        {
          id: 'class_trip',
          bin: 'safe',
          text: {
            he: 'קבוצת הכיתה: מחר יוצאים לטיול. להביא כובע ומים.',
            en: "Class group: Tomorrow we're going on a trip. Bring a hat and water.",
          },
          explain: {
            he: 'הודעה רגילה מהכיתה, בלי קישורים ובלי בקשות סודיות.',
            en: 'A normal message from your class, with no links and no secret requests.',
          },
        },
        {
          id: 'parcel_fee',
          bin: 'suspicious',
          text: {
            he: 'החבילה שלך מחכה! צריך לשלם דמי משלוח קטנים בקישור כדי לקבל אותה.',
            en: 'Your parcel is waiting! Pay a small delivery fee at the link to get it.',
          },
          explain: {
            he: 'תשלום מפתיע עם קישור הוא תרגיל נפוץ. כדאי לבקש ממבוגר לבדוק.',
            en: 'A surprise payment with a link is a common trick. Ask a grown-up to check.',
          },
        },
      ],
    },
    quiz: [
      {
        id: 'hurry',
        answer: 1,
        question: {
          he: 'הודעה אומרת: "מהר! עשו את זה עכשיו, אחרת תאבדו את החשבון!" מה עושים?',
          en: 'A message says: "Hurry! Do it now or you\'ll lose your account!" What do you do?',
        },
        options: {
          he: ['עושים מהר את מה שכתוב', 'עוצרים ומראים למבוגר שסומכים עליו', 'מעבירים לחברים'],
          en: ['Do what it says, fast', 'Stop and show a grown-up you trust', 'Forward it to friends'],
        },
        explain: {
          he: 'לחץ למהר הוא רמז לתרגיל. עוצרים ושואלים מבוגר.',
          en: "Rushing you is a clue that it's a trick. Stop and ask a grown-up.",
        },
      },
      {
        id: 'password_who',
        answer: 2,
        question: { he: 'למי מותר לספר את הסיסמה?', en: 'Who can you tell your password to?' },
        options: {
          he: ['לחברת משחקים שמבקשת בהודעה', 'לחבר חדש מהרשת', 'לאף אחד, חוץ מהורה כשצריך'],
          en: ['A game company that asks by message', 'A new online friend', 'Nobody, except a parent when needed'],
        },
        explain: {
          he: 'סיסמה נשארת פרטית. חברות אמיתיות אף פעם לא מבקשות אותה בהודעה.',
          en: 'Passwords stay private. Real companies never ask for them in a message.',
        },
      },
      {
        id: 'clue',
        answer: 0,
        question: { he: 'מה מאלה הוא רמז שהודעה מזויפת?', en: 'Which of these is a clue that a message is fake?' },
        options: {
          he: ['היא מבקשת קוד או סיסמה', 'היא מקבוצת הכיתה ומספרת על טיול', 'אין בה קישורים'],
          en: ['It asks for a code or a password', "It's from your class group about a trip", 'It has no links'],
        },
        explain: {
          he: 'בקשה לקוד או לסיסמה היא אחד הרמזים הכי גדולים לפישינג.',
          en: 'Asking for codes or passwords is one of the biggest phishing clues.',
        },
      },
    ],
    summary: {
      he: 'אם הודעה מלחיצה, מציעה פרס מפתיע או מבקשת סיסמה או קוד, עוצרים ומראים למבוגר שסומכים עליו.',
      en: 'If a message rushes you, offers a surprise prize, or asks for a password or code, stop and show a grown-up you trust.',
    },
  },
  {
    id: 'cyber-03',
    version: 1,
    intro: [
      {
        he: 'יש מידע שכיף לשתף ברשת, כמו הצבע האהוב או ציור שציירתם.',
        en: 'Some information is fun to share online, like your favourite colour or a drawing you made.',
      },
      {
        he: 'ויש מידע פרטי, שעוזר לזרים למצוא אתכם או להיכנס לחשבונות שלכם: כתובת, בית ספר, מספר טלפון, סיסמה ותמונות שמראות איפה אתם.',
        en: 'Other information is private, because it helps strangers find you or get into your accounts: your address, school, phone number, passwords and photos that show where you are.',
      },
      {
        he: 'לפני ששולחים, שואלים: זה עוזר למישהו לדעת מי אני ואיפה אני? אם כן, זה פרטי. כשלא בטוחים, שואלים מבוגר.',
        en: "Before you send something, ask: does this help someone know who I am and where I am? If so, it's private. When you're not sure, ask a grown-up.",
      },
    ],
    game: {
      prompt: {
        he: 'מה פרטי ומה אפשר לשתף במשחק או בצ׳אט?',
        en: "What's private, and what's OK to share in a game or chat?",
      },
      bins: [
        { id: 'share', label: { he: 'אפשר לשתף', en: 'OK to share' } },
        { id: 'private', label: { he: 'פרטי', en: 'Private' } },
      ],
      items: [
        {
          id: 'home_address',
          bin: 'private',
          text: { he: 'הכתובת של הבית שלכם', en: 'Your home address' },
          explain: {
            he: 'כתובת אומרת לזרים איפה בדיוק אתם גרים.',
            en: 'An address tells strangers exactly where you live.',
          },
        },
        {
          id: 'fav_color',
          bin: 'share',
          text: { he: 'הצבע האהוב עליכם', en: 'Your favourite colour' },
          explain: {
            he: 'צבע אהוב לא עוזר לאף אחד למצוא אתכם. כיף לשתף!',
            en: "A favourite colour doesn't help anyone find you. Fun to share!",
          },
        },
        {
          id: 'school_name',
          bin: 'private',
          text: { he: 'השם של בית הספר שלכם', en: 'The name of your school' },
          explain: {
            he: 'בית הספר אומר איפה אתם נמצאים כמעט כל יום.',
            en: 'Your school tells people where you are almost every day.',
          },
        },
        {
          id: 'dragon_drawing',
          bin: 'share',
          text: { he: 'ציור של דרקון שציירתם', en: 'A drawing of a dragon you made' },
          explain: {
            he: 'ציור הוא דרך מצוינת לשתף בלי לגלות פרטים.',
            en: 'A drawing is a great way to share without giving away details.',
          },
        },
        {
          id: 'password',
          bin: 'private',
          text: { he: 'הסיסמה למשחק', en: 'Your game password' },
          explain: {
            he: 'סיסמה לא משתפים אף פעם, חוץ מעם ההורים.',
            en: 'A password is never shared, except with your parents.',
          },
        },
        {
          id: 'book_opinion',
          bin: 'share',
          text: { he: 'מה חשבתם על ספר שקראתם', en: 'What you thought of a book you read' },
          explain: {
            he: 'דעות ותחביבים אפשר לשתף. רק לא מוסיפים פרטים כמו שם מלא או כתובת.',
            en: "Opinions and hobbies are fine to share. Just don't add details like your full name or address.",
          },
        },
        {
          id: 'uniform_photo',
          bin: 'private',
          text: { he: 'תמונה שלכם עם הסמל של בית הספר על החולצה', en: 'A photo of you wearing your school logo' },
          explain: {
            he: 'גם תמונה יכולה לגלות איפה אתם. בודקים מה רואים ברקע ועל הבגדים.',
            en: 'Photos can give away where you are too. Check what shows in the background and on your clothes.',
          },
        },
      ],
    },
    quiz: [
      {
        id: 'which_private',
        answer: 1,
        question: { he: 'מה מכל אלה פרטי?', en: 'Which of these is private?' },
        options: {
          he: ['החיה האהובה עליכם', 'מספר הטלפון שלכם', 'המשחק האהוב עליכם'],
          en: ['Your favourite animal', 'Your phone number', 'Your favourite game'],
        },
        explain: {
          he: 'מספר טלפון מאפשר לזרים ליצור איתכם קשר, אז הוא נשאר פרטי.',
          en: 'A phone number lets strangers contact you, so it stays private.',
        },
      },
      {
        id: 'photo',
        answer: 0,
        question: { he: 'רוצים לשלוח תמונה. מה בודקים קודם?', en: 'You want to send a photo. What do you check first?' },
        options: {
          he: ['שלא רואים בה כתובת, שלט רחוב או סמל של בית ספר', 'שהיא צבעונית מספיק', 'שיש בה לפחות שלושה אנשים'],
          en: ['That it shows no address, street sign or school logo', "That it's colourful enough", 'That it has at least three people in it'],
        },
        explain: {
          he: 'פרטים קטנים ברקע יכולים לגלות איפה אתם.',
          en: 'Little details in the background can show where you are.',
        },
      },
      {
        id: 'unsure',
        answer: 2,
        question: {
          he: 'לא בטוחים אם משהו פרטי. מה עושים?',
          en: "You're not sure if something is private. What do you do?",
        },
        options: {
          he: ['שולחים בכל זאת', 'מנחשים', 'שואלים הורה או מבוגר אחר שסומכים עליו'],
          en: ['Send it anyway', 'Guess', 'Ask a parent or another adult you trust'],
        },
        explain: {
          he: 'כשלא בטוחים, עוצרים ושואלים. עדיף לשאול מאשר להצטער.',
          en: "When you're not sure, stop and ask. Better to ask than be sorry.",
        },
      },
    ],
    summary: {
      he: 'מידע פרטי, כמו כתובת, בית ספר, טלפון וסיסמה, נשאר אצלנו. תחביבים, דעות וציורים אפשר לשתף. כשלא בטוחים, שואלים מבוגר.',
      en: 'Private information like your address, school, phone number and passwords stays with you. Hobbies, opinions and drawings are fine to share. When unsure, ask a grown-up.',
    },
  },
  {
    id: 'cyber-04',
    version: 1,
    intro: [
      {
        he: 'בהרבה משחקים אפשר לקנות מטבעות, יהלומים או סקינים. נוכלים יודעים שכולם רוצים אותם בחינם.',
        en: 'Lots of games sell coins, gems or skins. Scammers know everyone wants them for free.',
      },
      {
        he: 'הם מבטיחים מטבעות בחינם, ובתמורה מבקשים סיסמה, קוד שנשלח בהודעה, הורדה של אפליקציה או קוד של כרטיס מתנה.',
        en: 'They promise free coins, and in return they ask for a password, a code sent by text, an app download or a gift card code.',
      },
      {
        he: 'הכלל: מטבעות אמיתיים מגיעים רק מתוך המשחק עצמו או מהחנות הרשמית, ואף פעם לא בתמורה לסיסמה.',
        en: 'The rule: real coins only come from inside the game itself or its official store, and never in exchange for a password.',
      },
    ],
    game: {
      prompt: { he: 'מיינו כל הצעה: בטוחה או עוקץ?', en: 'Sort each offer: safe or a scam?' },
      practiceNotice: {
        he: 'אלה הצעות אימון שהמצאנו בשביל המשחק הזה. הן לא אמיתיות.',
        en: 'These are practice offers we made up for this game. They are not real.',
      },
      bins: [
        { id: 'safe', label: { he: 'בטוחה', en: 'Safe' } },
        { id: 'scam', label: { he: 'עוקץ', en: 'Scam' } },
      ],
      items: [
        {
          id: 'login_site',
          bin: 'scam',
          text: {
            he: 'אתר שמבטיח 10,000 מטבעות למי שמתחבר עם שם המשתמש והסיסמה של המשחק',
            en: 'A website promises 10,000 coins if you log in with your game username and password',
          },
          explain: {
            he: 'אתר זר שמבקש את הסיסמה רוצה לגנוב את החשבון.',
            en: 'A random site asking for your password wants to steal your account.',
          },
        },
        {
          id: 'level_reward',
          bin: 'safe',
          text: {
            he: 'המשחק עצמו נותן 50 מטבעות על סיום שלב',
            en: 'The game itself gives you 50 coins for finishing a level',
          },
          explain: {
            he: 'פרסים מתוך המשחק, על משהו שעשיתם, הם הדרך הרגילה לקבל מטבעות.',
            en: 'Rewards inside the game, for something you did, are the normal way to get coins.',
          },
        },
        {
          id: 'double_coins',
          bin: 'scam',
          text: {
            he: 'שחקן בצ׳אט: תנו לי את המטבעות שלכם ואחזיר לכם פי שניים',
            en: "A player in chat: give me your coins and I'll give you back double",
          },
          explain: {
            he: '"תנו לי ואחזיר כפול" הוא תרגיל ישן. המטבעות לא חוזרים.',
            en: '"Give me yours and I\'ll double them" is an old trick. The coins never come back.',
          },
        },
        {
          id: 'official_store',
          bin: 'safe',
          text: {
            he: 'ההורים קונים מטבעות בחנות הרשמית של המשחק',
            en: "Your parents buy coins in the game's official store",
          },
          explain: {
            he: 'קנייה עם ההורים בחנות הרשמית היא הדרך הבטוחה.',
            en: 'Buying with your parents in the official store is the safe way.',
          },
        },
        {
          id: 'generator_app',
          bin: 'scam',
          text: {
            he: 'סרטון שאומר להוריד אפליקציה של "מחולל מטבעות"',
            en: 'A video tells you to download a "coin generator" app',
          },
          explain: {
            he: 'אין דבר כזה מחולל מטבעות. אפליקציות כאלה יכולות להיות וירוס או לגנוב את החשבון.',
            en: "Coin generators don't exist. Apps like that can be a virus or steal your account.",
          },
        },
        {
          id: 'event_prize',
          bin: 'safe',
          text: {
            he: 'אירוע בתוך המשחק שנותן פרס לכל מי שמשתתף',
            en: 'An event inside the game gives a prize to everyone who takes part',
          },
          explain: {
            he: 'אירועים בתוך המשחק עצמו הם בטוחים, ולא צריך למסור בהם שום פרט.',
            en: "Events inside the game itself are safe, and you don't have to give any details.",
          },
        },
        {
          id: 'gift_card',
          bin: 'scam',
          text: {
            he: 'הודעה: שלחו את הקוד מכרטיס מתנה ותקבלו פי עשרה מטבעות',
            en: 'A message: send the code from a gift card and get ten times the coins',
          },
          explain: {
            he: 'מי שמבקש קוד של כרטיס מתנה רוצה את הכסף. אף משחק רשמי לא מבקש את זה.',
            en: 'Anyone asking for a gift card code wants the money. No official game asks for that.',
          },
        },
      ],
    },
    quiz: [
      {
        id: 'too_good',
        answer: 0,
        question: {
          he: 'הצעה נשמעת טובה מדי כדי להיות אמיתית. מה זה אומר בדרך כלל?',
          en: 'An offer sounds too good to be true. What does that usually mean?',
        },
        options: {
          he: ['שזה כנראה עוקץ', 'שהיום יום המזל', 'שצריך למהר לפני שזה נגמר'],
          en: ["It's probably a scam", "It's your lucky day", 'You should hurry before it runs out'],
        },
        explain: {
          he: 'כשמשהו נשמע טוב מדי, זה הסימן לעצור ולבדוק עם מבוגר.',
          en: "When something sounds too good, that's the sign to stop and check with a grown-up.",
        },
      },
      {
        id: 'password_for_coins',
        answer: 1,
        question: {
          he: 'מישהו מבקש את הסיסמה כדי להוסיף לכם מטבעות. מה עושים?',
          en: 'Someone asks for your password so they can add coins. What do you do?',
        },
        options: {
          he: ['נותנים, זה בשביל מטבעות', 'לא נותנים, ומספרים להורה', 'נותנים רק חצי מהסיסמה'],
          en: ["Give it, it's for coins", "Don't give it, and tell a parent", 'Give only half of it'],
        },
        explain: {
          he: 'אף אחד לא צריך את הסיסמה כדי לתת מטבעות. מי שמבקש אותה רוצה לגנוב.',
          en: 'Nobody needs your password to give you coins. Whoever asks for it wants to steal.',
        },
      },
      {
        id: 'real_coins',
        answer: 2,
        question: { he: 'מאיפה מגיעים מטבעות אמיתיים?', en: 'Where do real coins come from?' },
        options: {
          he: ['מאתרים שמבקשים להתחבר', 'משחקנים בצ׳אט', 'מתוך המשחק או מהחנות הרשמית'],
          en: ['Sites that ask you to log in', 'Players in chat', 'The game itself or its official store'],
        },
        explain: {
          he: 'רק המשחק עצמו והחנות הרשמית שלו נותנים מטבעות אמיתיים.',
          en: 'Only the game itself and its official store give real coins.',
        },
      },
    ],
    summary: {
      he: 'מטבעות בחינם בתמורה לסיסמה, לקוד או להורדה הם עוקץ. מטבעות אמיתיים מגיעים רק מתוך המשחק או מהחנות הרשמית, ועל כל הצעה מוזרה מספרים להורה.',
      en: 'Free coins in exchange for a password, a code or a download are a scam. Real coins only come from the game or its official store, and you tell a parent about any strange offer.',
    },
  },
  {
    id: 'cyber-05',
    version: 1,
    intro: [
      {
        he: 'הרשאה היא כשאפליקציה מבקשת רשות להשתמש במשהו בטלפון: המצלמה, המיקרופון, המיקום, אנשי הקשר או התמונות.',
        en: 'A permission is when an app asks to use something on your phone: the camera, microphone, location, contacts or photos.',
      },
      {
        he: 'השאלה החשובה: האפליקציה צריכה את זה כדי לעבוד? אפליקציית צילום צריכה מצלמה. פנס לא צריך את אנשי הקשר.',
        en: "The big question: does the app need it to work? A camera app needs the camera. A flashlight doesn't need your contacts.",
      },
      {
        he: "כשבקשה נראית מוזרה, לוחצים 'לא לאפשר' ושואלים הורה. תמיד אפשר לשנות את זה אחר כך בהגדרות.",
        en: "When a request looks strange, tap 'Don't allow' and ask a parent. You can always change it later in Settings.",
      },
    ],
    game: {
      prompt: { he: 'כל בקשה הגיונית או חשודה?', en: 'Does each request make sense, or is it suspicious?' },
      bins: [
        { id: 'makes_sense', label: { he: 'הגיונית', en: 'Makes sense' } },
        { id: 'suspicious', label: { he: 'חשודה', en: 'Suspicious' } },
      ],
      items: [
        {
          id: 'camera_app',
          bin: 'makes_sense',
          text: { he: 'אפליקציית צילום מבקשת גישה למצלמה', en: 'A photo app asks to use the camera' },
          explain: {
            he: 'כדי לצלם היא צריכה מצלמה. זה הגיוני.',
            en: 'It needs the camera to take photos. Makes sense.',
          },
        },
        {
          id: 'flashlight_contacts',
          bin: 'suspicious',
          text: { he: 'אפליקציית פנס מבקשת גישה לאנשי הקשר', en: 'A flashlight app asks for your contacts' },
          explain: {
            he: 'פנס רק מדליק אור. אין לו שום סיבה לראות את אנשי הקשר.',
            en: 'A flashlight just makes light. It has no reason to see your contacts.',
          },
        },
        {
          id: 'map_location',
          bin: 'makes_sense',
          text: { he: 'אפליקציית מפות מבקשת את המיקום', en: 'A map app asks for your location' },
          explain: {
            he: 'כדי להראות את הדרך, מפה צריכה לדעת איפה אתם.',
            en: 'To show you the way, a map needs to know where you are.',
          },
        },
        {
          id: 'puzzle_microphone',
          bin: 'suspicious',
          text: {
            he: 'משחק פאזל מבקש להשתמש במיקרופון כל הזמן',
            en: 'A puzzle game asks to use the microphone all the time',
          },
          explain: {
            he: 'פאזל לא צריך לשמוע אתכם. בקשה כזאת היא סיבה לעצור ולשאול.',
            en: "A puzzle doesn't need to hear you. A request like that is a reason to stop and ask.",
          },
        },
        {
          id: 'drawing_photos',
          bin: 'makes_sense',
          text: {
            he: 'אפליקציית ציור מבקשת לשמור את הציור בתמונות',
            en: 'A drawing app asks to save your picture to your photos',
          },
          explain: {
            he: 'כדי לשמור את הציור שלכם, היא צריכה גישה לתמונות. זה הגיוני.',
            en: 'To save your picture, it needs to reach your photos. Makes sense.',
          },
        },
        {
          id: 'calculator_location',
          bin: 'suspicious',
          text: { he: 'מחשבון מבקש לדעת איפה אתם', en: 'A calculator asks to know where you are' },
          explain: {
            he: 'מחשבון מחשב מספרים. הוא לא צריך את המיקום שלכם.',
            en: "A calculator does sums. It doesn't need your location.",
          },
        },
      ],
    },
    quiz: [
      {
        id: 'what_is',
        answer: 0,
        question: { he: 'מה זו הרשאה?', en: 'What is a permission?' },
        options: {
          he: ['אפליקציה שמבקשת רשות להשתמש במשהו בטלפון', 'סוג של משחק', 'סיסמה חדשה'],
          en: ['An app asking to use something on your phone', 'A kind of game', 'A new password'],
        },
        explain: {
          he: 'הרשאה היא רשות שנותנים לאפליקציה, למשל לצלם או לדעת איפה אתם.',
          en: 'A permission is something you let an app do, like use the camera or know where you are.',
        },
      },
      {
        id: 'strange',
        answer: 1,
        question: {
          he: 'אפליקציה מבקשת משהו שהיא לא צריכה. מה עושים?',
          en: "An app asks for something it doesn't need. What do you do?",
        },
        options: {
          he: ['מאשרים מהר כדי להתחיל לשחק', "לוחצים 'לא לאפשר' ושואלים הורה", 'מאשרים הכול, זה תמיד בסדר'],
          en: ['Allow it quickly to start playing', "Tap 'Don't allow' and ask a parent", "Allow everything, it's always fine"],
        },
        explain: {
          he: 'מותר להגיד לא. אם האפליקציה באמת צריכה את זה, ההורים יעזרו להחליט.',
          en: "You're allowed to say no. If the app really needs it, your parents can help decide.",
        },
      },
      {
        id: 'later',
        answer: 2,
        question: {
          he: 'אישרתם הרשאה ועכשיו התחרטתם. אפשר לבטל?',
          en: 'You allowed a permission and changed your mind. Can you undo it?',
        },
        options: {
          he: ['לא, זה לתמיד', 'רק אם קונים טלפון חדש', 'כן, בהגדרות של הטלפון'],
          en: ["No, it's forever", 'Only with a new phone', "Yes, in the phone's Settings"],
        },
        explain: {
          he: 'בהגדרות אפשר לראות ולשנות כל הרשאה. כדאי לעשות את זה יחד עם הורה.',
          en: "In Settings you can see and change every permission. It's a good idea to do it with a parent.",
        },
      },
    ],
    summary: {
      he: "לפני שמאשרים הרשאה שואלים: האפליקציה באמת צריכה את זה? אם הבקשה מוזרה, לוחצים 'לא לאפשר' ושואלים הורה. אפשר לשנות הכול אחר כך בהגדרות.",
      en: "Before allowing a permission, ask: does the app really need this? If the request is strange, tap 'Don't allow' and ask a parent. You can change it all later in Settings.",
    },
  },
  {
    id: 'cyber-06',
    version: 1,
    intro: [
      {
        he: 'לפעמים קורה ברשת משהו מפחיד, מבלבל או לא נעים. זה לא אשמתכם, וזה קורה גם לילדים אחרים.',
        en: "Sometimes something scary, confusing or unkind happens online. It's not your fault, and it happens to other kids too.",
      },
      {
        he: 'מבוגר שסומכים עליו, כמו הורה, מורה או מישהו מצוות בית הספר, רוצה לדעת ויכול לעזור. לספר זה הצעד הנכון.',
        en: 'A trusted adult, like a parent, a teacher or someone on the school staff, wants to know and can help. Telling is the right move.',
      },
      {
        he: 'כשמישהו ברשת מבקש לשמור משהו בסוד מההורים, זה סימן ברור לספר. הפתעה ליום הולדת זה בסדר, כי בסוף כולם יודעים.',
        en: "If someone online asks you to keep something secret from your parents, that's a clear sign to tell. A birthday surprise is fine, because everyone finds out in the end.",
      },
    ],
    game: {
      prompt: { he: 'מה עושים בכל מצב?', en: 'What do you do in each situation?' },
      bins: [
        { id: 'handle', label: { he: 'מסתדרים לבד', en: 'I can handle it' } },
        { id: 'tell', label: { he: 'מספרים למבוגר', en: 'Tell a grown-up' } },
      ],
      items: [
        {
          id: 'secret_request',
          bin: 'tell',
          text: {
            he: 'מישהו שהכרתם במשחק כותב: "אל תספרו להורים שאנחנו מדברים"',
            en: 'Someone you met in a game writes: "Don\'t tell your parents we talk"',
          },
          explain: {
            he: 'בקשה לשמור סוד מההורים היא סימן אזהרה. מספרים מיד.',
            en: 'Being asked to keep secrets from your parents is a warning sign. Tell right away.',
          },
        },
        {
          id: 'avatar_color',
          bin: 'handle',
          text: {
            he: 'לא מצליחים להחליט באיזה צבע לצבוע את הדמות במשחק',
            en: "You can't decide what colour to make your game character",
          },
          explain: { he: 'זו החלטה שלכם. בוחרים לבד ונהנים.', en: "That's your call. Pick one and have fun." },
        },
        {
          id: 'photo_request',
          bin: 'tell',
          text: {
            he: 'מישהו ברשת מבקש שתשלחו לו תמונה שלכם',
            en: 'Someone online asks you to send them a photo of yourself',
          },
          explain: {
            he: 'לא שולחים תמונות לאנשים מהרשת, ומספרים למבוגר שסומכים עליו.',
            en: "Don't send photos to people online, and tell an adult you trust.",
          },
        },
        {
          id: 'funny_joke',
          bin: 'handle',
          text: { he: 'חבר מהכיתה שלח לכם בדיחה מצחיקה ונחמדה', en: 'A classmate sent you a funny, friendly joke' },
          explain: {
            he: 'בדיחה נחמדה ממישהו שמכירים היא בסדר גמור.',
            en: 'A friendly joke from someone you know is totally fine.',
          },
        },
        {
          id: 'scary_video',
          bin: 'tell',
          text: {
            he: 'ראיתם סרטון מפחיד שלא יוצא לכם מהראש',
            en: "You saw a scary video and can't stop thinking about it",
          },
          explain: {
            he: 'לדבר עם מבוגר על מה שראיתם עוזר להרגיש טוב יותר.',
            en: 'Talking to a grown-up about what you saw helps you feel better.',
          },
        },
        {
          id: 'mean_messages',
          bin: 'tell',
          text: { he: 'מישהו שולח לכם הודעות מעליבות שוב ושוב', en: 'Someone keeps sending you mean messages' },
          explain: {
            he: 'הודעות מעליבות שחוזרות שוב ושוב הן בריונות ברשת. שומרים צילום מסך ומספרים למבוגר.',
            en: 'Mean messages again and again are cyberbullying. Keep a screenshot and tell an adult.',
          },
        },
      ],
    },
    quiz: [
      {
        id: 'who',
        answer: 0,
        question: { he: 'מי זה מבוגר שסומכים עליו?', en: 'Who is a trusted adult?' },
        options: {
          he: ['הורה, מורה או מבוגר מוכר שאכפת לו מכם', 'כל מי שכותב ברשת שהוא מבוגר', 'דמות במשחק'],
          en: ['A parent, teacher or adult you know who cares about you', "Anyone online who says they're an adult", 'A character in a game'],
        },
        explain: {
          he: 'מבוגר שסומכים עליו הוא מישהו שמכירים בחיים האמיתיים ושאכפת לו מכם.',
          en: 'A trusted adult is someone you know in real life who cares about you.',
        },
      },
      {
        id: 'trouble',
        answer: 1,
        question: {
          he: 'חוששים לספר כי אולי מישהו יכעס. מה נכון?',
          en: "You're worried about telling because someone might be angry. What's true?",
        },
        options: {
          he: ['עדיף לשתוק', 'לספר זה הצעד הנכון, ומבוגר שסומכים עליו ירצה לעזור', 'מספרים רק אם זה קרה יותר מעשר פעמים'],
          en: ['Better to stay quiet', 'Telling is right, and a trusted adult will want to help', 'Only tell if it happened more than ten times'],
        },
        explain: {
          he: 'גם אם הייתה טעות, מבוגר שסומכים עליו יעדיף לדעת ולעזור.',
          en: 'Even if a mistake happened, a trusted adult would rather know and help.',
        },
      },
      {
        id: 'secret',
        answer: 2,
        question: {
          he: 'מה ההבדל בין הפתעה לבין סוד שצריך לספר עליו?',
          en: "What's the difference between a surprise and a secret you should tell about?",
        },
        options: {
          he: ['אין הבדל', 'הפתעה תמיד מפחידה', 'הפתעה נגמרת כשכולם יודעים, ועל סוד מההורים מספרים'],
          en: ["There's no difference", 'Surprises are always scary', 'A surprise ends when everyone finds out; a secret from parents gets told'],
        },
        explain: {
          he: 'הפתעות הן קצרות ומשמחות. כשמישהו מבקש להסתיר משהו מההורים, מספרים.',
          en: 'Surprises are short and happy. When someone asks you to hide something from your parents, you tell.',
        },
      },
    ],
    summary: {
      he: 'כשמשהו ברשת מפחיד, מבלבל או לא נעים, או כשמישהו מבקש סוד מההורים, מספרים למבוגר שסומכים עליו. זה לא אשמתכם, ולספר זה תמיד הצעד הנכון.',
      en: "When something online is scary, confusing or unkind, or someone asks you to keep a secret from your parents, tell an adult you trust. It's not your fault, and telling is always the right move.",
    },
  },
];
