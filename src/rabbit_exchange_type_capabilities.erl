%% This exchange implementation is similar to the concept of a headers
%% exchange, except that the publisher determines the consumer the message
%% goes to by way of "capabilities" in the published message. Consumers
%% bind to the exchange with a list of capabilities they provide, and
%% messages are routed to consumers which fit *all* of the capabilities.
%%
%% Only headers/arguments prefixed with "x-capability-" are taken into
%% account during matching, to avoid collision with other properties. So
%% for example, publishing a message with header `x-capability-foo: bar"
%% will only be routed to bindings where this argument pair is provided.
%%
%% It is worth noting that the implementation of this exchange relies on
%% the internally sorted headers provided by RabbitMQ; if at any point
%% these headers come back to this exchange unsorted, we will have to
%% update the matching alongside the changes.

-module(rabbit_exchange_type_capabilities).
-behaviour(rabbit_exchange_type).

-include_lib("rabbit_common/include/rabbit.hrl").
-include_lib("rabbit_common/include/rabbit_framing.hrl").

-export([description/0, serialise_events/0, route/2]).
-export([info/1, info/2, validate/1, validate_binding/2,
         create/2, delete/3, policy_changed/2, add_binding/3,
         remove_bindings/3, assert_args_equivalence/2]).

-rabbit_boot_step({?MODULE,
    [{description, "Exchange type with support for matching against required capabilities"},
     {mfa,         {rabbit_registry, register, [exchange, <<"x-capabilities">>, ?MODULE]}},
     {requires,    rabbit_registry},
     {enables,     kernel_ready}]}).

%%-----------------------------------------------
%% Implemented custom behaviour for this exchange
%%-----------------------------------------------

description() ->
    [{description, <<"Exchange type with support for matching against required capabilities">>}].

route(#exchange{name = Name}, #delivery{message = #basic_message{content = Content}}) ->
    capabilities = case (Content#content.properties)#'P_basic'.headers of
        undefined -> [];
        H         -> rabbit_misc:sort_field_table(H)
    end,
    rabbit_router:match_bindings(Name, fun (#binding{args = Provided}) ->
        capability_match(capabilities, Provided)
    end).

serialise_events() -> false.

%%----------------------------------------------------
%% Default behaviour implementations for this exchange
%%----------------------------------------------------

info(_X) -> [].
info(_X, _Is) -> [].
validate(_X) -> ok.
validate_binding(_X, _B) -> ok.
create(_Tx, _X) -> ok.
delete(_Tx, _X, _Bs) -> ok.
policy_changed(_X1, _X2) -> ok.
add_binding(_Tx, _X, _B) -> ok.
remove_bindings(_Tx, _X, _Bs) -> ok.
assert_args_equivalence(X, Args) ->
    rabbit_exchange:assert_args_equivalence(X, Args).

%%---------------------------------------------------
%% Private function implementations for this exchange
%%---------------------------------------------------

% All capabilities provided, all matched
capability_match([], _Provided) ->
    true;

% No provided capabilities left, no match
capability_match([_|_], []) ->
    false;

% If provided key is after our required key, we can guarantee that we missed the capability
capability_match([{<<"x-capability-", RK/binary>>, _RT, _RV} | _], [{PK, _PT, _PV} | _])
    when PK < RK ->
        false;

% Matching capability, so we move onto the rest of the capabilities
capability_match([{<<"x-capability-", RK/binary>>, _, RV} | RRest], [{<<"x-capability-", PK/binary>>, _PT, PV} | PRest])
    when RK == PK andalso RV == PV ->
        capability_match(RRest, PRest);

% We haven't yet found the header we care about, so keep going for the time being
capability_match([{<<"x-capability-", _/binary>>, _, _} | _] = Capabilities, [_ | PRest]) ->
    capability_match(Capabilities, PRest);

% Skip any headers which aren't flagged as capabilities
capability_match([_ | RRest], Provided) ->
    capability_match(RRest, Provided).
