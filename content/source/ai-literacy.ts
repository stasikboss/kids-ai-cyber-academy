import type { SourceLesson } from './types.ts';

/** AI literacy track (free, ages 8+). Hebrew avoids gendered second person: plural forms throughout. */
export const AI_LITERACY: SourceLesson[] = [
  {
    id: 'ai-01',
    version: 1,
    intro: [
      {
        he: 'שלום, אני SI, רובוט דרקון ותוכנת מחשב. בואו נגלה מה זו בינה מלאכותית!',
        en: "Hi, I'm SI, a dragon robot and a computer program. Let's find out what AI is!",
      },
      {
        he: 'בינה מלאכותית (AI) היא תוכנת מחשב שלומדת דפוסים מהמון דוגמאות. אחר כך היא משתמשת בדפוסים האלה כדי לנחש תשובות, לזהות תמונות או לכתוב טקסט.',
        en: 'AI (artificial intelligence) is a computer program that learns patterns from lots and lots of examples. Then it uses those patterns to guess answers, recognise pictures or write text.',
      },
      {
        he: 'בינה מלאכותית לא חושבת ולא מרגישה כמו בן אדם. היא מוצאת דפוסים מהר מאוד, וגם יכולה לטעות.',
        en: "AI doesn't think or feel like a person. It is a very fast pattern-finder, and it can be wrong.",
      },
    ],
    game: {
      prompt: { he: 'מיינו כל דבר: יש בו בינה מלאכותית או אין?', en: 'Sort each thing: does it use AI or not?' },
      bins: [
        { id: 'ai', label: { he: 'יש בינה מלאכותית', en: 'Uses AI' } },
        { id: 'no_ai', label: { he: 'אין בינה מלאכותית', en: 'No AI' } },
      ],
      items: [
        {
          id: 'face_unlock',
          bin: 'ai',
          text: {
            he: 'טלפון שנפתח כשהוא מזהה את הפנים שלך',
            en: 'A phone that unlocks when it recognises your face',
          },
          explain: {
            he: 'הטלפון למד איך נראות הפנים שלך מהרבה תמונות. זו בינה מלאכותית.',
            en: "The phone learned what your face looks like from many pictures. That's AI.",
          },
        },
        {
          id: 'light_switch',
          bin: 'no_ai',
          text: { he: 'מתג שמדליק את המנורה', en: 'A switch that turns on the lamp' },
          explain: {
            he: 'המתג רק סוגר מעגל חשמלי. הוא לא לומד שום דבר.',
            en: "The switch just closes an electric circuit. It doesn't learn anything.",
          },
        },
        {
          id: 'video_suggestions',
          bin: 'ai',
          text: {
            he: 'אפליקציית וידאו שממליצה מה לראות אחר כך',
            en: 'A video app that suggests what to watch next',
          },
          explain: {
            he: 'היא לומדת ממה שצפית בו קודם ומנחשת מה יעניין אותך.',
            en: "It learns from what you watched before and guesses what you'll like.",
          },
        },
        {
          id: 'calculator',
          bin: 'no_ai',
          text: { he: 'מחשבון שמחבר 2 ועוד 2', en: 'A calculator adding 2 + 2' },
          explain: {
            he: 'המחשבון פועל לפי כללים קבועים. הוא לא לומד מדוגמאות.',
            en: "A calculator follows fixed rules. It doesn't learn from examples.",
          },
        },
        {
          id: 'chatbot',
          bin: 'ai',
          text: { he: 'צ׳אטבוט שעונה על שאלות', en: 'A chatbot that answers questions' },
          explain: {
            he: 'צ׳אטבוט למד ממיליוני טקסטים איך לכתוב תשובות. זו בינה מלאכותית.',
            en: "A chatbot learned how to write answers from millions of texts. That's AI.",
          },
        },
        {
          id: 'doorbell',
          bin: 'no_ai',
          text: { he: 'פעמון בדלת שמצלצל כשלוחצים עליו', en: 'A doorbell that rings when you press it' },
          explain: {
            he: 'הפעמון תמיד עושה את אותו הדבר. אין בו למידה.',
            en: "The doorbell always does the same thing. There's no learning in it.",
          },
        },
      ],
    },
    quiz: [
      {
        id: 'how_learns',
        answer: 0,
        question: { he: 'איך בינה מלאכותית לומדת?', en: 'How does AI learn?' },
        options: {
          he: ['מהמון דוגמאות', 'היא ישנה בלילה', 'היא יודעת הכול מההתחלה'],
          en: ['From lots of examples', 'By sleeping at night', 'It knows everything from the start'],
        },
        explain: { he: 'בינה מלאכותית מוצאת דפוסים בהמון דוגמאות.', en: 'AI finds patterns in lots of examples.' },
      },
      {
        id: 'mistakes',
        answer: 1,
        question: { he: 'האם בינה מלאכותית יכולה לטעות?', en: 'Can AI make mistakes?' },
        options: {
          he: ['אף פעם', 'כן, לפעמים', 'רק בימי שלישי'],
          en: ['Never', 'Yes, sometimes', 'Only on Tuesdays'],
        },
        explain: {
          he: 'היא מנחשת לפי דפוסים, ולפעמים הניחוש שגוי. תמיד כדאי לבדוק.',
          en: "AI guesses from patterns, and sometimes the guess is wrong. It's always worth checking.",
        },
      },
      {
        id: 'true_fact',
        answer: 1,
        question: { he: 'מה נכון לגבי בינה מלאכותית?', en: 'Which one is true about AI?' },
        options: {
          he: ['היא שמחה ועצובה כמו אנשים', 'היא תוכנת מחשב שמוצאת דפוסים', 'בתוך המחשב גר בן אדם אמיתי'],
          en: ['It feels happy and sad like people', 'It is a computer program that finds patterns', 'A real person lives inside the computer'],
        },
        explain: {
          he: 'בינה מלאכותית היא תוכנה. אין לה רגשות, גם כשהיא כותבת כמו בן אדם.',
          en: 'AI is a program. It has no feelings, even when it writes like a person.',
        },
      },
    ],
    summary: {
      he: 'בינה מלאכותית היא תוכנת מחשב שלומדת דפוסים מדוגמאות. היא שימושית, אבל יכולה לטעות, והיא לא בן אדם.',
      en: 'AI is a computer program that learns patterns from examples. It is useful, but it can be wrong, and it is not a person.',
    },
  },
  {
    id: 'ai-02',
    version: 1,
    intro: [
      {
        he: "בינה מלאכותית לומדת כמו בלש שאוסף הרבה רמזים. אנשים מראים לה המון דוגמאות, ולכל דוגמה יש תווית, למשל תמונה שכתוב עליה 'תפוח'.",
        en: "AI learns like a detective collecting lots of clues. People show it many examples, and each one has a label, like a photo marked 'apple'.",
      },
      {
        he: 'מאלפי דוגמאות היא מוצאת דפוסים: תפוחים הם בדרך כלל עגולים, אדומים או ירוקים, עם גבעול קטן.',
        en: 'From thousands of examples it finds patterns: apples are usually round, red or green, with a little stem.',
      },
      {
        he: 'דוגמאות טובות מלמדות אותה טוב. דוגמאות שגויות או מבלבלות מלמדות אותה טעויות. לכן הדוגמאות חשובות מאוד!',
        en: 'Good examples teach it well. Wrong or confusing examples teach it mistakes. So the examples matter a lot!',
      },
    ],
    game: {
      prompt: {
        he: 'עזרו לרובוט ללמוד איך נראה תפוח. כל דוגמה עוזרת לו או מבלבלת אותו?',
        en: 'Help a robot learn what an apple looks like. Does each example help it or confuse it?',
      },
      bins: [
        { id: 'helps', label: { he: 'עוזרת ללמוד', en: 'Helps it learn' } },
        { id: 'confuses', label: { he: 'מבלבלת', en: 'Confuses it' } },
      ],
      items: [
        {
          id: 'red_apple',
          bin: 'helps',
          text: {
            he: "תמונה ברורה של תפוח אדום, עם התווית 'תפוח'",
            en: "A clear photo of a red apple, labelled 'apple'",
          },
          explain: {
            he: 'תמונה ברורה עם התווית הנכונה היא דוגמה מצוינת.',
            en: 'A clear photo with the right label is a great example.',
          },
        },
        {
          id: 'tomato',
          bin: 'confuses',
          text: { he: "תמונה של עגבנייה, עם התווית 'תפוח'", en: "A photo of a tomato, labelled 'apple'" },
          explain: {
            he: 'התווית שגויה, אז הרובוט לומד שעגבניות הן תפוחים.',
            en: 'The label is wrong, so the robot learns that tomatoes are apples.',
          },
        },
        {
          id: 'green_apple',
          bin: 'helps',
          text: { he: "תמונה של תפוח ירוק, עם התווית 'תפוח'", en: "A photo of a green apple, labelled 'apple'" },
          explain: {
            he: 'יש תפוחים בצבעים שונים. גיוון עוזר לרובוט לזהות את כולם.',
            en: 'Apples come in different colours. Variety helps the robot recognise all of them.',
          },
        },
        {
          id: 'dark_photo',
          bin: 'confuses',
          text: {
            he: "תמונה חשוכה ומטושטשת מאוד, עם התווית 'תפוח'",
            en: "A very dark, blurry photo, labelled 'apple'",
          },
          explain: {
            he: 'אם אי אפשר לראות את התפוח, גם הרובוט לא יכול ללמוד מהתמונה.',
            en: "If you can't see the apple, the robot can't learn from the photo either.",
          },
        },
        {
          id: 'banana',
          bin: 'confuses',
          text: { he: "תמונה של בננה, עם התווית 'תפוח'", en: "A photo of a banana, labelled 'apple'" },
          explain: {
            he: 'עוד תווית שגויה. הרובוט עלול להתחיל לקרוא לבננות תפוחים.',
            en: 'Another wrong label. The robot might start calling bananas apples.',
          },
        },
        {
          id: 'bitten_apple',
          bin: 'helps',
          text: {
            he: "תמונה של תפוח אכול עד חציו, עם התווית 'תפוח'",
            en: "A photo of a half-eaten apple, labelled 'apple'",
          },
          explain: {
            he: 'תפוחים לא תמיד נראים מושלמים. דוגמאות מהחיים האמיתיים עוזרות לרובוט.',
            en: "Apples don't always look perfect. Real-life examples help the robot.",
          },
        },
      ],
    },
    quiz: [
      {
        id: 'labels',
        answer: 0,
        question: { he: 'מה זו תווית באימון של בינה מלאכותית?', en: 'What is a label in AI training?' },
        options: {
          he: ['שם שאומר לבינה המלאכותית מה יש בדוגמה', 'מדבקה על המחשב', 'הצבע האהוב על הבינה המלאכותית'],
          en: ["A name that tells the AI what's in an example", 'A sticker on the computer', "The AI's favourite colour"],
        },
        explain: {
          he: "תווית אומרת לבינה המלאכותית מה מופיע בכל דוגמה, למשל 'תפוח' או 'חתול'.",
          en: "A label tells the AI what each example shows, like 'apple' or 'cat'.",
        },
      },
      {
        id: 'wrong_labels',
        answer: 1,
        question: {
          he: 'מה קורה אם להרבה דוגמאות יש תוויות שגויות?',
          en: 'What happens if many examples have wrong labels?',
        },
        options: {
          he: ['הבינה המלאכותית מתקנת אותן לבד', 'הבינה המלאכותית לומדת את הטעויות', 'שום דבר לא משתנה'],
          en: ['The AI fixes them by itself', 'The AI learns the mistakes', 'Nothing changes'],
        },
        explain: {
          he: 'בינה מלאכותית לומדת ממה שמראים לה, כולל מהטעויות.',
          en: "AI learns from what it's shown, including the mistakes.",
        },
      },
      {
        id: 'variety',
        answer: 2,
        question: {
          he: 'למה כדאי להראות לבינה המלאכותית תפוחים בהרבה צבעים וצורות?',
          en: 'Why show the AI apples of many colours and shapes?',
        },
        options: {
          he: ['כדי שהיא תהיה רעבה', 'זה לא משנה', 'כדי שהיא תזהה כל מיני תפוחים'],
          en: ['To make it hungry', "It doesn't matter", 'So it recognises all kinds of apples'],
        },
        explain: {
          he: 'ככל שהדוגמאות מגוונות יותר, היא מזהה יותר סוגים של תפוחים.',
          en: 'The more varied the examples, the more kinds of apples it can recognise.',
        },
      },
    ],
    summary: {
      he: 'בינה מלאכותית לומדת דפוסים מהמון דוגמאות עם תוויות. דוגמאות ברורות, נכונות ומגוונות מלמדות אותה טוב, ודוגמאות שגויות מלמדות אותה טעויות.',
      en: 'AI learns patterns from lots of labelled examples. Clear, correct and varied examples teach it well; wrong ones teach it mistakes.',
    },
  },
  {
    id: 'ai-03',
    version: 1,
    intro: [
      {
        he: 'בינה מלאכותית יכולה להישמע בטוחה מאוד בעצמה ובכל זאת לטעות. לפעמים היא אפילו ממציאה עובדות שנשמעות אמיתיות.',
        en: 'AI can sound very sure of itself and still be wrong. Sometimes it even makes up facts that sound real.',
      },
      {
        he: 'זה קורה כי היא מנחשת את המילים הכי סבירות, ולא כי היא בדקה את העובדות.',
        en: 'That happens because it guesses the most likely words, not because it checked the facts.',
      },
      {
        he: 'לכן כשמשהו חשוב, כמו בריאות, בטיחות או מבחן בבית הספר, בודקים עם מבוגר שסומכים עליו או במקור אמין.',
        en: 'So when something matters, like health, safety or a school test, check with a trusted adult or a reliable source.',
      },
    ],
    game: {
      prompt: { he: 'מה עושים עם כל תשובה של בינה מלאכותית?', en: 'What do you do with each AI answer?' },
      bins: [
        { id: 'fine', label: { he: 'בסדר בשביל הכיף', en: 'Fine for fun' } },
        { id: 'check', label: { he: 'בודקים קודם', en: 'Check it first' } },
      ],
      items: [
        {
          id: 'mushroom',
          bin: 'check',
          text: {
            he: 'בינה מלאכותית אומרת שפטרייה שמצאת בפארק בטוחה לאכילה',
            en: 'AI says a mushroom you found in the park is safe to eat',
          },
          explain: {
            he: 'אף פעם לא אוכלים פטרייה רק כי בינה מלאכותית אמרה. פטריות בר יכולות להיות מסוכנות, אז שואלים מבוגר.',
            en: 'Never eat a mushroom just because AI said so. Wild mushrooms can be dangerous, so ask an adult.',
          },
        },
        {
          id: 'drawing_name',
          bin: 'fine',
          text: { he: 'בינה מלאכותית מציעה שם מצחיק לציור שלך', en: 'AI suggests a funny name for your drawing' },
          explain: {
            he: 'שם לציור לא יכול להזיק לאף אחד. תיהנו!',
            en: "A name for a drawing can't hurt anyone. Have fun!",
          },
        },
        {
          id: 'history_date',
          bin: 'check',
          text: {
            he: 'בינה מלאכותית אומרת תאריך של אירוע חשוב בשביל מבחן',
            en: 'AI gives you the date of a famous event for a test',
          },
          explain: {
            he: 'בינה מלאכותית יכולה להתבלבל בתאריכים. בודקים בספר הלימוד או עם המורה.',
            en: 'AI can mix up dates. Check in your schoolbook or with your teacher.',
          },
        },
        {
          id: 'medicine',
          bin: 'check',
          text: {
            he: 'בינה מלאכותית אומרת כמה תרופה לקחת נגד כאב ראש',
            en: 'AI says how much medicine to take for a headache',
          },
          explain: {
            he: 'על תרופות מחליטים רק הורה או רופא.',
            en: 'Only a parent or a doctor decides about medicine.',
          },
        },
        {
          id: 'cat_poem',
          bin: 'fine',
          text: { he: 'בינה מלאכותית כותבת שיר מצחיק על החתול שלך', en: 'AI writes a silly poem about your cat' },
          explain: {
            he: 'שיר מצחיק הוא בשביל הכיף, אז טעויות לא משנות.',
            en: "A silly poem is just for fun, so mistakes don't matter.",
          },
        },
        {
          id: 'safe_site',
          bin: 'check',
          text: {
            he: 'בינה מלאכותית אומרת שאתר מסוים בטוח להקלדת סיסמה',
            en: 'AI says a website is safe for typing your password',
          },
          explain: {
            he: 'בינה מלאכותית יכולה לטעות בענייני בטיחות. שואלים הורה לפני שמקלידים סיסמה בכל מקום.',
            en: 'AI can be wrong about safety. Ask a parent before typing a password anywhere.',
          },
        },
      ],
    },
    quiz: [
      {
        id: 'confident',
        answer: 1,
        question: {
          he: 'בינה מלאכותית נשמעת בטוחה מאוד בתשובה. זה אומר שהתשובה נכונה?',
          en: "AI sounds very sure about an answer. Does that mean it's right?",
        },
        options: {
          he: ['כן, תמיד', 'לא בהכרח, היא עדיין יכולה לטעות', 'רק אם היא משתמשת במילים ארוכות'],
          en: ['Yes, always', 'Not necessarily, it can still be wrong', 'Only if it uses long words'],
        },
        explain: {
          he: 'בינה מלאכותית יכולה להישמע בטוחה ובכל זאת לטעות.',
          en: 'AI can sound sure and still be wrong.',
        },
      },
      {
        id: 'made_up',
        answer: 0,
        question: { he: 'למה בינה מלאכותית ממציאה לפעמים עובדות?', en: 'Why does AI sometimes make up facts?' },
        options: {
          he: ['היא מנחשת מילים סבירות במקום לבדוק עובדות', 'היא רוצה לעבוד עלינו', 'היא עייפה'],
          en: ['It guesses likely words instead of checking facts', 'It wants to trick you', "It's tired"],
        },
        explain: {
          he: 'בינה מלאכותית מנבאת מילים שנשמעות נכון. היא לא תמיד בודקת אם הן נכונות.',
          en: "AI predicts words that sound right. It doesn't always check whether they're true.",
        },
      },
      {
        id: 'health',
        answer: 2,
        question: {
          he: 'בינה מלאכותית נותנת עצה על הבריאות שלך. מה עושים?',
          en: 'AI gives you advice about your health. What do you do?',
        },
        options: {
          he: ['עושים מה שכתוב מיד', 'לא שואלים אף מבוגר', 'שואלים הורה או רופא'],
          en: ['Do what it says right away', "Don't ask any adult", 'Ask a parent or a doctor'],
        },
        explain: {
          he: 'שאלות על בריאות שואלים הורה או רופא, לא רק בינה מלאכותית.',
          en: 'Health questions go to a parent or a doctor, not to AI alone.',
        },
      },
    ],
    summary: {
      he: 'בינה מלאכותית יכולה להישמע בטוחה ובכל זאת לטעות. לדברים של כיף זה בסדר; על בריאות, בטיחות או עובדות לבית הספר בודקים עם מבוגר שסומכים עליו או במקור אמין.',
      en: "AI can sound sure and still be wrong. For fun things that's fine; for health, safety or school facts, check with a trusted adult or a reliable source.",
    },
  },
  {
    id: 'ai-04',
    version: 1,
    intro: [
      {
        he: 'בינה מלאכותית יכולה ליצור תמונות, סרטונים וקולות שנראים ונשמעים אמיתיים. חלק מהם נקראים דיפ־פייק.',
        en: 'AI can make pictures, videos and voices that look and sound real. Some of them are called deepfakes.',
      },
      {
        he: 'לפעמים יש רמזים, כמו ידיים מוזרות, כיתוב מטושטש או צללים שלא מתאימים. אבל בינה מלאכותית חדשה טועה פחות, אז רמזים לא מספיקים.',
        en: "Sometimes there are clues, like strange hands, blurry writing or shadows that don't match. But new AI makes fewer mistakes, so clues aren't enough.",
      },
      {
        he: 'הבדיקה הכי טובה היא המקור: מי פרסם את זה ראשון, והאם אתרי חדשות אמינים או מבוגרים אומרים אותו הדבר?',
        en: 'The best check is the source: who posted it first, and do trusted news sites or adults say the same thing?',
      },
    ],
    game: {
      prompt: {
        he: 'האם כל אחת מהדרכים האלה טובה לבדוק אם משהו אמיתי?',
        en: 'Is each one a good way to check whether something is real?',
      },
      bins: [
        { id: 'good', label: { he: 'דרך טובה לבדוק', en: 'Good way to check' } },
        { id: 'not_good', label: { he: 'לא דרך טובה לבדוק', en: 'Not a good way to check' } },
      ],
      items: [
        {
          id: 'who_posted',
          bin: 'good',
          text: { he: 'לברר מי פרסם את זה ראשון', en: 'Find out who posted it first' },
          explain: {
            he: 'לדעת מה המקור עוזר מאוד. אתר חדשות אמיתי אמין יותר מחשבון לא מוכר.',
            en: 'Knowing the source helps a lot. A real news site is more reliable than an unknown account.',
          },
        },
        {
          id: 'news_sites',
          bin: 'good',
          text: {
            he: 'לבדוק אם אתרי חדשות אמינים מדווחים אותו הדבר',
            en: 'See whether trusted news sites report the same thing',
          },
          explain: {
            he: 'אם קרה משהו גדול באמת, גם החדשות האמינות ידווחו עליו.',
            en: 'If something big really happened, trusted news will report it too.',
          },
        },
        {
          id: 'ask_adult',
          bin: 'good',
          text: { he: 'לשאול מבוגר שסומכים עליו', en: 'Ask a grown-up you trust' },
          explain: { he: 'מבוגר יכול לעזור לבדוק ולהחליט.', en: 'A grown-up can help you look into it and decide.' },
        },
        {
          id: 'many_likes',
          bin: 'not_good',
          text: { he: 'יש לזה המון לייקים, אז זה בטח אמיתי', en: 'It has lots of likes, so it must be real' },
          explain: {
            he: 'גם לדברים מזויפים יש הרבה לייקים. לייקים לא מראים מה נכון.',
            en: "Fake things get lots of likes too. Likes don't show what's true.",
          },
        },
        {
          id: 'looks_real',
          bin: 'not_good',
          text: { he: 'זה נראה מאוד אמיתי, אז זה בטח אמיתי', en: 'It looks very realistic, so it must be real' },
          explain: {
            he: 'בינה מלאכותית יכולה ליצור דברים שנראים אמיתיים לגמרי. מראה אמיתי הוא לא הוכחה.',
            en: 'AI can make things look completely real. Looking real is not proof.',
          },
        },
        {
          id: 'friend_shared',
          bin: 'not_good',
          text: { he: 'חבר שיתף את זה, אז זה בטח אמיתי', en: 'A friend shared it, so it must be real' },
          explain: {
            he: 'גם חברים יכולים להתבלבל. בודקים מאיפה זה הגיע.',
            en: 'Friends can be fooled too. Check where it came from.',
          },
        },
      ],
    },
    quiz: [
      {
        id: 'deepfake',
        answer: 0,
        question: { he: 'מה זה דיפ־פייק?', en: 'What is a deepfake?' },
        options: {
          he: ['סרטון, תמונה או קול שבינה מלאכותית יצרה כדי שייראו אמיתיים', 'בריכה עמוקה מאוד', 'סוג של וירוס מחשב'],
          en: ['A video, picture or voice made by AI to seem real', 'A very deep swimming pool', 'A type of computer virus'],
        },
        explain: {
          he: 'דיפ־פייק הוא תוכן מזויף שנוצר בבינה מלאכותית כך שייראה אמיתי.',
          en: 'A deepfake is fake media made with AI so that it seems real.',
        },
      },
      {
        id: 'best_check',
        answer: 1,
        question: { he: 'מה הדרך הכי טובה לבדוק סרטון מפתיע?', en: "What's the best way to check a surprising video?" },
        options: {
          he: ['לספור את הלייקים', 'לבדוק מי פרסם אותו ואם מקורות אמינים מסכימים', 'לצפות בו שוב'],
          en: ['Count the likes', 'Check who posted it and whether trusted sources agree', 'Watch it again'],
        },
        explain: {
          he: 'המקור ומקורות אמינים אחרים אומרים הרבה יותר מלייקים.',
          en: 'The source and other trusted sources tell you much more than likes.',
        },
      },
      {
        id: 'voice',
        answer: 2,
        question: {
          he: 'שומעים הודעה קולית שנשמעת כמו זמרת מפורסמת שמבקשת כסף. מה חושבים?',
          en: 'You hear a voice message that sounds like a famous singer asking for money. What do you think?',
        },
        options: {
          he: ['זה בטח אמיתי כי זה נשמע בדיוק אותו הדבר', 'שולחים מהר את הכסף', 'זה יכול להיות זיוף, אז לא סומכים ושואלים מבוגר'],
          en: ['It must be real because it sounds the same', 'I send the money quickly', "It could be AI-made, so I don't trust it and ask an adult"],
        },
        explain: {
          he: 'בינה מלאכותית יכולה לחקות קולות. אף פעם לא שולחים כסף בגלל קול, ושואלים מבוגר.',
          en: 'AI can copy voices. Never send money because of a voice, and ask an adult.',
        },
      },
    ],
    summary: {
      he: 'בינה מלאכותית יכולה ליצור תמונות, סרטונים וקולות מזויפים שנראים אמיתיים. לא סומכים על מראה או לייקים; בודקים את המקור ושואלים מבוגר שסומכים עליו.',
      en: "AI can make fake pictures, videos and voices that seem real. Don't trust looks or likes; check the source and ask a grown-up you trust.",
    },
  },
  {
    id: 'ai-05',
    version: 1,
    intro: [
      {
        he: 'בינה מלאכותית עונה טוב יותר כשהשאלה ברורה. שאלה טובה אומרת מה רוצים ואיך רוצים את התשובה.',
        en: 'AI answers better when the question is clear. A good question says what you want and how you want the answer.',
      },
      {
        he: 'טיפים: אומרים מה הנושא, מבקשים מילים פשוטות, מבקשים מספר מסוים של רעיונות, ושואלים שאלת המשך אם משהו לא ברור.',
        en: "Tips: say the topic, ask for simple words, ask for a set number of ideas, and ask a follow-up question if something isn't clear.",
      },
      {
        he: 'אבל אף פעם לא כותבים בשאלה פרטים אישיים, כמו שם, כתובת, בית ספר או סיסמאות.',
        en: 'But never put private details in a question, like your name, address, school or passwords.',
      },
    ],
    game: {
      prompt: { he: 'האם כל שאלה טובה, או שצריך לתקן אותה?', en: 'Is each question good, or does it need fixing?' },
      bins: [
        { id: 'good', label: { he: 'שאלה טובה', en: 'Good question' } },
        { id: 'fix', label: { he: 'צריך לתקן', en: 'Needs fixing' } },
      ],
      items: [
        {
          id: 'volcano_clear',
          bin: 'good',
          text: {
            he: 'תסביר במילים פשוטות לילדים בני 9 איך הר געש מתפרץ',
            en: 'Explain in simple words for 9-year-olds how a volcano erupts',
          },
          explain: {
            he: 'נושא ברור ורמה ברורה. הבינה המלאכותית יודעת בדיוק מה לעשות.',
            en: 'Clear topic, clear level. The AI knows exactly what to do.',
          },
        },
        {
          id: 'volcano_vague',
          bin: 'fix',
          text: { he: 'הר געש', en: 'Volcano' },
          explain: {
            he: "'הר געש' זו לא שאלה. מה רוצים לדעת על הרי געש?",
            en: "'Volcano' isn't a question. What do you want to know about volcanoes?",
          },
        },
        {
          id: 'plant_ideas',
          bin: 'good',
          text: {
            he: 'תן לי 3 רעיונות לפרויקט מדעי על צמחים',
            en: 'Give me 3 ideas for a science project about plants',
          },
          explain: { he: 'יש נושא ויש מספר רעיונות. מצוין!', en: 'It says the topic and how many ideas. Great!' },
        },
        {
          id: 'do_thing',
          bin: 'fix',
          text: { he: 'תעשה את הדבר הזה', en: 'Do the thing' },
          explain: {
            he: 'הבינה המלאכותית לא יכולה לדעת איזה דבר. אומרים מה צריך.',
            en: "The AI can't know which thing. Say what you need.",
          },
        },
        {
          id: 'private_info',
          bin: 'fix',
          text: {
            he: 'אני דן מבית ספר אלונים, תעזור לי בשיעורי בית',
            en: "I'm Dan from Oak School, help me with my homework",
          },
          explain: {
            he: 'אף פעם לא משתפים שם או בית ספר עם בינה מלאכותית. שואלים רק את השאלה של שיעורי הבית.',
            en: 'Never share your name or school with AI. Ask just the homework question.',
          },
        },
        {
          id: 'frog_toad',
          bin: 'good',
          text: { he: 'מה 2 ההבדלים בין צפרדע לקרפדה?', en: 'What are 2 differences between a frog and a toad?' },
          explain: {
            he: 'שאלה ברורה ומדויקת שקל לענות עליה.',
            en: "A clear, specific question that's easy to answer.",
          },
        },
      ],
    },
    quiz: [
      {
        id: 'best',
        answer: 1,
        question: { he: 'איזו שאלה הכי ברורה?', en: 'Which question is clearest?' },
        options: {
          he: ['חלל', 'תגיד לי 3 עובדות מעניינות על הירח', 'דברים על דברים'],
          en: ['Space', 'Tell me 3 fun facts about the Moon', 'Stuff about things'],
        },
        explain: { he: 'היא אומרת מה הנושא וכמה עובדות רוצים.', en: 'It names the topic and how many facts you want.' },
      },
      {
        id: 'private',
        answer: 2,
        question: { he: 'מה לא כותבים בשאלה לבינה מלאכותית?', en: 'What do you leave out of a question to AI?' },
        options: {
          he: ['את הנושא', "את המילה 'בבקשה'", 'שם, כתובת, בית ספר וסיסמאות'],
          en: ['The topic', "The word 'please'", 'Your name, address, school and passwords'],
        },
        explain: {
          he: 'פרטים אישיים אף פעם לא נכנסים לשיחות עם בינה מלאכותית.',
          en: 'Private details never go into chats with AI.',
        },
      },
      {
        id: 'not_clear',
        answer: 0,
        question: {
          he: 'התשובה של הבינה המלאכותית קשה להבנה. מה אפשר לעשות?',
          en: "The AI's answer is hard to understand. What can you do?",
        },
        options: {
          he: ['לבקש שתסביר במילים פשוטות יותר', 'לוותר', 'לצעוק על המחשב'],
          en: ['Ask it to explain in simpler words', 'Give up', 'Shout at the computer'],
        },
        explain: {
          he: "תמיד אפשר לשאול שאלת המשך, למשל: 'תסביר יותר בפשטות'.",
          en: "You can always ask a follow-up, like 'Explain it more simply'.",
        },
      },
    ],
    summary: {
      he: 'שאלה טובה היא ברורה: מה הנושא, מה רוצים ועד כמה פשוט. שואלים שאלות המשך כשצריך, ואף פעם לא כותבים פרטים אישיים.',
      en: 'Good questions are clear: the topic, what you want and how simple. Ask follow-ups when you need to, and never include private details.',
    },
  },
  {
    id: 'ai-06',
    version: 1,
    intro: [
      {
        he: 'בינה מלאכותית יכולה לדבר בצורה חברותית, אבל היא תוכנת מחשב. אין לה רגשות, והיא לא דואגת לך כמו שאנשים דואגים.',
        en: "AI can chat in a friendly way, but it's a computer program. It has no feelings, and it doesn't care about you the way people do.",
      },
      {
        he: 'יש אפליקציות שגורמות לבינה מלאכותית להיראות כמו חבר הכי טוב. זה יכול להרגיש נעים, אבל חברים ומשפחה אמיתיים הם אלה שבאמת מכירים אותך.',
        en: 'Some apps make AI seem like a best friend. That can feel nice, but real friends and family are the ones who really know you.',
      },
      {
        he: 'בינה מלאכותית מצוינת להסברים, לתרגול ולרעיונות. על רגשות, דאגות והחלטות גדולות מדברים עם אדם אמיתי שסומכים עליו.',
        en: 'AI is great for explaining, practising and ideas. For feelings, worries and big decisions, talk to a real person you trust.',
      },
    ],
    game: {
      prompt: { he: 'מי העוזר הנכון לכל מצב?', en: 'Who is the right helper for each situation?' },
      bins: [
        { id: 'ai', label: { he: 'עבודה טובה לבינה מלאכותית', en: 'A good job for AI' } },
        { id: 'person', label: { he: 'מדברים עם אדם אמיתי', en: 'Talk to a real person' } },
      ],
      items: [
        {
          id: 'math_step',
          bin: 'ai',
          text: { he: 'הסבר של שלב בתרגיל חשבון', en: 'Explaining a step in a maths exercise' },
          explain: {
            he: 'בינה מלאכותית יכולה להסביר בסבלנות, שוב ושוב.',
            en: 'AI can explain things patiently, again and again.',
          },
        },
        {
          id: 'sad_fight',
          bin: 'person',
          text: { he: 'עצב אחרי ריב עם חבר', en: 'Feeling sad after a fight with a friend' },
          explain: {
            he: 'רגשות צריכים אדם אמיתי שאכפת לו, כמו הורה או חבר.',
            en: 'Feelings deserve a real person who cares, like a parent or a friend.',
          },
        },
        {
          id: 'card_ideas',
          bin: 'ai',
          text: { he: 'רעיונות לכרטיס ברכה ליום הולדת', en: 'Ideas for a birthday card' },
          explain: {
            he: 'סיעור מוחות של רעיונות הוא עבודה מצוינת לבינה מלאכותית.',
            en: 'Brainstorming ideas is a great job for AI.',
          },
        },
        {
          id: 'scared_online',
          bin: 'person',
          text: { he: 'מישהו ברשת מפחיד אותך', en: 'Someone online is scaring you' },
          explain: {
            he: 'מספרים מיד למבוגר שסומכים עליו. הוא באמת יכול לעזור ולהגן.',
            en: 'Tell a trusted adult right away. They can really help and protect you.',
          },
        },
        {
          id: 'translate_word',
          bin: 'ai',
          text: { he: 'תרגום מילה לאנגלית', en: 'Translating a word into Hebrew' },
          explain: {
            he: 'תרגום של מילה הוא עבודה קצרה שבינה מלאכותית עושה טוב.',
            en: 'Translating a word is a quick job AI does well.',
          },
        },
        {
          id: 'stranger_request',
          bin: 'person',
          text: {
            he: 'מישהו שלא מכירים מבקש ברשת לעשות משהו',
            en: "Someone you don't know asks you online to do something",
          },
          explain: {
            he: 'בקשות של זרים מעבירים למבוגר שסומכים עליו, אף פעם לא רק לבינה מלאכותית.',
            en: 'Requests from strangers go to a trusted adult, never to AI alone.',
          },
        },
      ],
    },
    quiz: [
      {
        id: 'feelings',
        answer: 1,
        question: { he: 'יש לבינה מלאכותית רגשות?', en: 'Does AI have feelings?' },
        options: {
          he: ['כן, בדיוק כמו לאנשים', 'לא, היא תוכנת מחשב', 'רק בסופי שבוע'],
          en: ['Yes, just like people', "No, it's a computer program", 'Only at weekends'],
        },
        explain: {
          he: 'בינה מלאכותית יכולה לכתוב מילים על רגשות, אבל היא לא מרגישה כלום.',
          en: "AI can write words about feelings, but it doesn't feel anything.",
        },
      },
      {
        id: 'worried',
        answer: 0,
        question: {
          he: 'משהו מדאיג אותך. עם מי הכי טוב לדבר?',
          en: 'Something is worrying you. Who is best to talk to?',
        },
        options: {
          he: ['עם הורה או מבוגר אחר שסומכים עליו', 'רק עם צ׳אטבוט', 'עם אף אחד'],
          en: ['A parent or another adult you trust', 'Only a chatbot', 'Nobody'],
        },
        explain: {
          he: 'אנשים שמכירים אותך ואכפת להם יכולים באמת לעזור.',
          en: 'People who know you and care about you can really help.',
        },
      },
      {
        id: 'best_friend',
        answer: 2,
        question: {
          he: 'אפליקציה אומרת שהבינה המלאכותית שלה היא החבר הכי טוב שלך. מה נכון?',
          en: "An app says its AI is your best friend. What's true?",
        },
        options: {
          he: ['היא באמת אוהבת אותך', 'היא זוכרת אותך לתמיד כמו חבר', 'היא תוכנה, וחברים אמיתיים הם אנשים'],
          en: ['It really loves you', 'It remembers you forever like a friend', "It's a program, and real friends are people"],
        },
        explain: {
          he: 'בינה מלאכותית יכולה להועיל, אבל חברות היא בין אנשים.',
          en: 'AI can be useful, but friendship is between people.',
        },
      },
    ],
    summary: {
      he: 'בינה מלאכותית היא כלי שימושי להסברים ולרעיונות. אין לה רגשות, אז על דאגות, רגשות והחלטות גדולות מדברים עם אדם אמיתי שסומכים עליו.',
      en: 'AI is a useful tool for explaining and ideas. It has no feelings, so for worries, feelings and big decisions, talk to a real person you trust.',
    },
  },
];
