import argparse
import json
from surveyor_verified_spans import verify_files

def export(question_pdf,answer_pdf):
    result=verify_files(question_pdf,answer_pdf)
    return {
        'schema':'surveyor_2025_afternoon_v1',
        'registryKey':'土地家屋調査士:2025:午後',
        'questionPdfSha256':result['question_pdf_sha256'],
        'answerPdfSha256':result['answer_pdf_sha256'],
        'questions':[
            {'number':n,
             'page':result['questions'][n]['page'],
             'rawSpan':result['questions'][n]['raw_span'],
             'spanSha256':result['questions'][n]['span_sha256'],
             'choices':result['questions'][n]['choices'],
             'answerNumber':result['answers'][n]}
            for n in range(1,21)
        ]
    }

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('question_pdf')
    parser.add_argument('answer_pdf')
    args=parser.parse_args()
    print(json.dumps(export(args.question_pdf,args.answer_pdf),ensure_ascii=False,separators=(',',':')))
