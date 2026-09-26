import test from 'node:test';
import assert from 'node:assert/strict';
import { DT } from '../dist/physics.js';
import { createBatControl, startStroke, releaseStroke, stepBat, strokeSnapshot, STANDARD_STROKE } from '../dist/bat-control.js';
import { describeShot, isSwing, isPlayingShot, isControlled, missTitle } from '../dist/shot-feedback.js';

function tapAt(seconds) {
  const control=createBatControl('right','standard');
  startStroke(control);releaseStroke(control);
  for(let i=0;i<Math.round(seconds/DT);i++)stepBat(control,DT);
  return {control,stroke:strokeSnapshot(control)};
}

test('a released Standard attack remains a played miss; Manual retains release-to-leave semantics',()=>{
  const {stroke}=tapAt(STANDARD_STROKE.contactTime);
  assert.equal(stroke.mode,'standard');assert.equal(stroke.held,false);assert.equal(stroke.committed,true);
  assert.equal(isSwing(stroke),true);assert.equal(isPlayingShot(stroke),true);
  assert.equal(missTitle({stroke},'Missed'),'Played & missed');assert.equal(isControlled({stroke},'Missed'),false);
  assert.notEqual(describeShot(stroke).timing,'Backed off');
  const manual={...stroke,mode:'manual'};
  assert.equal(isSwing(manual),false);assert.equal(isPlayingShot(manual),false);
  assert.equal(missTitle({stroke:manual},'Missed'),'Left alone');assert.equal(isControlled({stroke:manual},'Missed'),true);
  assert.equal(describeShot(manual).timing,'Backed off');
});

test('a Standard swing completed before arrival is an early miss even after returning to guard',()=>{
  for(const seconds of [.5,1.3]){
    const {stroke}=tapAt(seconds);
    assert.ok(['recover','guard'].includes(stroke.phase));assert.equal(stroke.active,false);assert.equal(stroke.held,false);
    assert.ok(stroke.elapsed>.4,'elapsed time survives the declining recovery progress');
    assert.equal(isPlayingShot(stroke),true);assert.equal(missTitle({stroke},'Missed'),'Played & missed');
    assert.equal(isControlled({stroke},'Missed'),false);assert.equal(describeShot(stroke).timing,'Early');
  }
});

test('Standard timing describes when the press occurred independently of button and animation progress',()=>{
  const base=tapAt(STANDARD_STROKE.contactTime).stroke;
  for(const held of [true,false]){
    assert.equal(describeShot({...base,held,elapsed:.02,progress:.9}).timing,'Late');
    assert.equal(describeShot({...base,held,elapsed:.2,progress:.1}).timing,'Early');
    assert.equal(describeShot({...base,held}, {quality:.9,edge:false}).timing,'Well timed');
    assert.equal(describeShot({...base,held,elapsed:.02}, {quality:.9,edge:false}).timing,'Late','a clean contact does not erase late timing');
  }
  const middle=describeShot(base,{quality:.9,edge:false}),edge=describeShot(base,{quality:.5,edge:true});
  assert.notEqual(middle.detail,edge.detail,'contact quality gives different advice at the same timing');
});

test('a correctly timed Standard miss distinguishes the wrong line, height and both',()=>{
  const {stroke}=tapAt(STANDARD_STROKE.contactTime);
  const miss={x:0,y:0,depth:0,gap:.2};
  assert.equal(describeShot(stroke,null,false,{...miss,x:.3}).timing,'Wrong line');
  assert.equal(describeShot(stroke,null,false,{...miss,y:.6}).timing,'Wrong height');
  assert.equal(describeShot(stroke,null,false,{...miss,x:.3,y:.6}).timing,'Wrong line & height');
  assert.equal(describeShot(stroke).timing,'Missed line','older snapshots without miss geometry remain readable');
  assert.equal(describeShot({...stroke,elapsed:.02},null,false,{...miss,y:.6}).timing,'Late','timing errors take precedence over an incidental spatial gap');
});

test('explicit cancellation backs out of a Standard attack; held defence still counts as a shot',()=>{
  const {control}=tapAt(.08);releaseStroke(control,true);stepBat(control,DT);
  const cancelled=strokeSnapshot(control);
  assert.equal(cancelled.cancelled,true);assert.equal(cancelled.active,false);assert.equal(isSwing(cancelled),false);
  assert.equal(isControlled({stroke:cancelled},'Missed'),true);assert.equal(missTitle({stroke:cancelled},'Missed'),'Left alone');
  assert.equal(describeShot(cancelled).timing,'Backed off');
  startStroke(control,true);stepBat(control,DT);
  const block=strokeSnapshot(control);
  assert.equal(block.defending,true);assert.equal(block.committed,false);assert.equal(isPlayingShot(block),true);
  assert.equal(missTitle({stroke:block},'Missed'),'Played & missed');assert.equal(describeShot(block).timing,'Beaten');
  releaseStroke(control);stepBat(control,DT);
  const released=strokeSnapshot(control);
  assert.equal(isPlayingShot(released),false);assert.equal(missTitle({stroke:released},'Missed'),'Left alone');
});

test('later cancellation, recovery and another input cannot rewrite the delivery snapshot',()=>{
  const {control,stroke}=tapAt(STANDARD_STROKE.contactTime),record={...stroke},delivery={stroke};
  releaseStroke(control,true);for(let i=0;i<240;i++)stepBat(control,DT);
  startStroke(control,true);stepBat(control,DT);
  assert.deepEqual(stroke,record);
  assert.equal(missTitle(delivery,'Missed'),'Played & missed');assert.equal(isControlled(delivery,'Missed'),false);
  assert.equal(describeShot(stroke).timing,'Missed line');
  for(const result of ['Bowled','LBW']){
    assert.equal(missTitle(delivery,result),result);assert.equal(isControlled(delivery,result),false);
    assert.equal(isControlled({...delivery,hit:true},result),false,'contact cannot override a dismissal');
  }
});
