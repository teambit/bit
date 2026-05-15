import { Aspect } from '../harmony/aspect';

export const DoctorAspect = Aspect.create({
  id: 'teambit.harmony/doctor',
  runtimes: { main: () => import('./doctor.main.runtime') },
  commands: () => import('./doctor.commands').then((m) => [m.doctorCommand]),
});
