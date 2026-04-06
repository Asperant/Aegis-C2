using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Aegis_API.Services;

namespace Aegis_API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "Commander")]
    public class EventsController : ControllerBase
    {
        private readonly IOperationalEventService _eventService;

        public EventsController(IOperationalEventService eventService)
        {
            _eventService = eventService;
        }

        [HttpGet("history")]
        public async Task<IActionResult> GetHistory([FromQuery] int count = 200)
        {
            var history = await _eventService.GetHistoryAsync(count);
            return Ok(history);
        }
    }
}
