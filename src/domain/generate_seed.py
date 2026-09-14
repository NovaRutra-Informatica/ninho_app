"""Convert the user's previously authorized course inventory into local app data."""
import html
import json
from pathlib import Path
import re
import unicodedata

root = Path(__file__).resolve().parents[2]
source = Path('C:/Users/aless/Documents/ChatGPT/Tarefas Mauá/output/anki')
inventory = json.loads((source / 'inventario_aulas.json').read_text(encoding='utf-8-sig'))

def subject_name(value):
    return 'Língua Portuguesa e Redação' if value == 'Língua Portuguesa, Literatura e Redação' else value

def slug(value):
    return re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower()).strip('-')

def text(value):
    value = re.sub(r'<(?:script|style)\b[^>]*>.*?</(?:script|style)>', '', value, flags=re.I | re.S)
    value = re.sub(r'<br\s*/?>|</(?:p|li|div)>', '\n', value, flags=re.I)
    value = re.sub(r'<[^>]+>', '', value)
    return re.sub(r'[ \t]+', ' ', html.unescape(value)).strip()

colors = ['#527969', '#a87659', '#738cba', '#af7f91', '#8b80b6', '#7b9581', '#5898a1', '#b49a51', '#7098bc', '#b27769', '#8d969d', '#6a9d83', '#9d825e', '#8688b6']
names = list(dict.fromkeys(subject_name(c['subject']) for c in inventory['cursos']))
subjects = [dict(id=slug(name), name=name, track='concurso', color=colors[i]) for i, name in enumerate(names)]
subjects.append(dict(id='ciencia-da-computacao', name='Ciência da Computação', track='faculdade', color='#738cba'))
courses = [dict(id=c['curso_id'], subjectId=slug(subject_name(c['subject'])), title=c['curso_titulo'], provider='Estratégia Concursos', url=c['curso_url']) for c in inventory['cursos']]
order = {}
lessons = []
for lesson in inventory['aulas']:
    course = lesson['curso_id']
    order[course] = order.get(course, -1) + 1
    lessons.append(dict(id=lesson['id'], courseId=course, subjectId=slug(subject_name(lesson['subject'])), title=lesson['titulo'], description=lesson['descricao'], url=lesson['url'], order=order[course], status='not-started', updatedAt=None, notes=''))
cards = []
for filename in ['cartoes_banco_dados_aula00.json', 'cartoes_literatura_aula00.json']:
    for i, card in enumerate(json.loads((source / filename).read_text(encoding='utf-8-sig'))):
        subject_id = slug(subject_name(card['subject']))
        lesson = next(lesson for lesson in lessons if lesson['url'].split('/videos/')[0] == card['source_url'].split('/videos/')[0])
        cards.append(dict(id=f'seed:{subject_id}:{i + 1:03}', subjectId=subject_id, lessonId=lesson['id'], question=text(card['pergunta']), answer=text(card['resposta_html']), source='Estratégia Concursos · ' + card['fonte'] + ' Conferido em ' + card['conferido_em'] + '. Cartão de estudo autoral baseado no material.', sourceUrl=card['source_url'], dueAt='2026-09-14T12:00:00.000Z', lastReviewedAt=None, intervalDays=0, ease=2.5, repetitions=0, lapses=0, flag='none', suspended=False, createdAt='2026-09-14T12:00:00.000Z'))

programs = [dict(id='senado-federal', name='Senado Federal', track='concurso', color='#527969', description='Analista Legislativo — Informática, Análise e Suporte a Sistemas.'), dict(id='maua', name='Mauá', track='faculdade', color='#738cba', description='Ciência da Computação · Instituto Mauá de Tecnologia.')]
for subject in subjects:
    subject['programId'] = 'senado-federal' if subject['track'] == 'concurso' else 'maua'
state = dict(version=2, programs=programs, settings=dict(name='Alessandro', dailyMinutes=30, newCardsPerDay=5, focusMinutes=25, breakMinutes=5, theme='light', sound=False, reducedMotion=False), subjects=subjects, courses=courses, lessons=lessons, cards=cards, exams=[], materials=[], sessions=[], tasks=[])
assert len(subjects) == 15 and len(courses) == 20 and len(lessons) == 271 and len(cards) == 71
target = root / 'resources' / 'seed.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({key: len(state[key]) for key in ['subjects', 'courses', 'lessons', 'cards']}, ensure_ascii=False))
