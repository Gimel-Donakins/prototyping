===============
    ISSUES
===============

1. ~~selecting any dropdown or performing any action resets the scroll location so that the user is at the top of the list of workstations in the Worbench Overview tab (same for all other pages)~~ COMPLETE

2. ~~the FIND A TOOL tab appears to simply [REMOVE] an item from the inventory as opposed to move the tool from the selected bench and move it to the bench you choise as [MY BENCH].~~ 

I received the following error: 

    Uncaught (in promise) TypeError: NetworkError when attempting to fetch resource.
        renderSearchStep1 http://localhost:3000/app.js:800
        AsyncFunctionThrow self-hosted:784 

when I clicked the [MOVE TO MY BENCH] button. I would like for the button to say [MOVE TO BENCH {the bench I have set as my bench}]. If my bench is set to BENCH 3, I should not be able to move a tool from my bench to my bench again. 

3. ~~You should be able to double click an item in the recommended list of items in the FIND A TOOL tab when typing/searching. Double clicking must autofill/select that tool in your search process. ~~ COMPLETE

4. ~~for longer items such as "Screwdriver (Flathead) -- missing" where the "-- missing" portion is moved to the next line. This does not follow Gestault principles, and makes it obfuscated to determine whether the item is missing, duplicated, or otherwise.~~ COMPLETE

5. ~~the [Movement Log] tab should be removed from the ribbon so that it is not clutered, and should rather be made into a very small logo the same HEIGHT as the REFRESH button and MY BENCH dropdown. The directory for the logo is './public/movement-log.png'~~ NEW: The MOVEMENT LOG should be able to be clicked a second time to "unclick" it. Unclicking this button should put the user back on the tab they were on previously.

6. When the user reloads the site, they should be put back on the same TAB as they were previously. Local storage should be used.