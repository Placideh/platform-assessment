import { Controller, Get } from '@nestjs/common';

@Controller()
export class CommonController {
  @Get()
  getHello(): { message: string } {
    return { message: 'Hello from Platform Engineer!' };
  }
}
