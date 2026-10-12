import argparse
import json
from surveyor_verified_spans import verify_files

def export_from_verified(result, year=2025, section='午後'):
    if section!='午後' or not isinstance(year,int) or year<1900:
        raise ValueError('UNSUPPORTED_EXPORT_IDENTITY')
    questions=result.get('questions',{})
    answers=result.get('answers',{})
    answer_evidence=result.get('answer_evidence',{})
    if set(questions)!=set(range(1,21)) or set(answers)!=set(range(1,21)) or set(answer_evidence)!=set(range(1,21)):
        raise ValueError('VERIFIED_RESULT_COVERAGE_INVALID')
    exported=[]
    for n in range(1,21):
        q=questions[n]
        ae=answer_evidence[n]
        if ae.get('answer')!=answers[n]:
            raise ValueError(f'ANSWER_EVIDENCE_MISMATCH:{n}')
        exported.append({
            'key':f'土地家屋調査士:{year}:{section}:{n}',
            'number':n,
            'page':q['page'],
            'pages':q['pages'],
            'rawSpan':q['raw_span'],
            'spanSha256':q['span_sha256'],
            'stemText':q['stem_text'],
            'stemSha256':q['stem_sha256'],
            'choices':q['choices'],
            'answerNumber':answers[n],
            'answerEvidence':ae['evidence'],
            'answerEvidenceSha256':ae['evidence_sha256'],
            'answerPage':ae['page'],
            'displayNumber':f'■{year}年度 午後の部 問{n}'
        })
    return {
        'schema':'surveyor_2025_afternoon_v1',
        'registryKey':f'土地家屋調査士:{year}:{section}',
        'qualification':'土地家屋調査士',
        'year':year,
        'section':section,
        'questionPdfSha256':result['question_pdf_sha256'],
        'answerPdfSha256':result['answer_pdf_sha256'],
        'questions':exported
    }

def export(question_pdf,answer_pdf):
    return export_from_verified(verify_files(question_pdf,answer_pdf))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('question_pdf')
    parser.add_argument('answer_pdf')
    args=parser.parse_args()
    print(json.dumps(export(args.question_pdf,args.answer_pdf),ensure_ascii=False,separators=(',',':')))
