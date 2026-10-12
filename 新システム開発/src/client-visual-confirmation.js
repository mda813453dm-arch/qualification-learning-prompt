/** Client visual confirmation is a distinct, required step.
 * Neither AI inspection nor a generated preview establishes user-visible delivery.
 */
export function confirmVisualDelivery({questionNumber,sourceImageSha256,renderedImageSha256,userConfirmedVisible=false}={}){
 if(!Number.isInteger(questionNumber)||questionNumber<1)return {status:'blocked',reason:'QUESTION_ID_INVALID'};
 if(!/^[a-f0-9]{64}$/.test(sourceImageSha256||''))return {status:'blocked',reason:'SOURCE_IMAGE_NOT_VERIFIED'};
 if(!/^[a-f0-9]{64}$/.test(renderedImageSha256||'')||renderedImageSha256!==sourceImageSha256)return {status:'blocked',reason:'RENDERED_IMAGE_UNVERIFIED'};
 if(userConfirmedVisible!==true)return {status:'blocked',reason:'USER_VISIBLE_IMAGE_NOT_CONFIRMED'};
 return {status:'display-confirmed',questionNumber,contentAndAnswerVerified:false,publishable:false};
}
